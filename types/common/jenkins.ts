import type { Protocol } from '@/types/common/vm';
import type { EnvironmentPort } from '@/types/common/project';

// Domain types for the per-environment Jenkins integration (Phase 2b · M3). An
// environment holds its job URL; the server, user and token are its VM's
// (`vm_jenkins` / `vm_jenkins_secrets`), the token only ever read server-side.
// See docs/jenkins-sync.md.

// Auth + target for a single Jenkins job request (resolved server-side).
export interface JenkinsAuth {
  username: string;
  apiToken: string;
}

// Normalized build status for a job (mapped from Jenkins' `color` + last build
// result). BUILDING overlays any of the others while a run is in progress.
export const JENKINS_STATUSES = [
  'SUCCESS',
  'FAILED',
  'UNSTABLE',
  'ABORTED',
  'DISABLED',
  'NOT_BUILT',
  'PENDING',
  'BUILDING',
  'UNKNOWN',
] as const;
export type JenkinsBuildStatus = (typeof JENKINS_STATUSES)[number];

// Raw job node from the Jenkins JSON API (folders/multibranch nest via `jobs`).
export interface JenkinsRawJob {
  name?: string;
  url?: string;
  color?: string;
  description?: string;
  jobs?: JenkinsRawJob[];
  lastCompletedBuild?: { number?: number; result?: string; timestamp?: number } | null;
}

// A runnable job flattened for display in the browse-jobs list.
export interface JenkinsJobSummary {
  name: string;
  path: string; // folder path, e.g. "chex-api / dev"
  url: string;
  status: JenkinsBuildStatus;
  building: boolean;
  lastBuildNumber: number | null;
  lastBuildAt: string | null; // ISO
  description: string;
}

export interface TriggerBuildResult {
  queued: boolean;
  // The Jenkins queue item for the build just triggered, taken from the trigger
  // response's `Location` header. This is the only handle on *this* run as
  // opposed to any other run of the same job — it's what the run poller follows.
  // Empty when Jenkins accepted the build but sent no Location.
  queueUrl: string;
}

// Where a triggered run currently is. QUEUED = accepted, waiting for an executor;
// RUNNING = an executor picked it up and a build number exists; DONE = finished
// with a result; CANCELLED = removed from the queue before starting; UNKNOWN =
// Jenkins no longer knows about it (queue items are only retained for a few
// minutes after they leave the queue).
export const JENKINS_RUN_PHASES = ['QUEUED', 'RUNNING', 'DONE', 'CANCELLED', 'UNKNOWN'] as const;
export type JenkinsRunPhase = (typeof JENKINS_RUN_PHASES)[number];

// Phases the poller should stop on — nothing further will change.
export const TERMINAL_RUN_PHASES: readonly JenkinsRunPhase[] = ['DONE', 'CANCELLED', 'UNKNOWN'];

export const isTerminalRunPhase = (phase: JenkinsRunPhase): boolean =>
  TERMINAL_RUN_PHASES.includes(phase);

// A single poll of a triggered run, flattened for the UI. The service resolves
// Jenkins' two-phase queue→build model into this one shape so neither the hook
// nor the component has to know about it.
export interface JenkinsRunState {
  phase: JenkinsRunPhase;
  // Why it's still queued ("Waiting for next available executor…") — QUEUED only.
  reason: string;
  // Build number, once an executor has assigned one (RUNNING and DONE).
  buildNumber: number | null;
  // The build's own URL — the poller follows this once the queue item resolves,
  // because queue items expire but builds don't.
  buildUrl: string;
  // Final result, DONE only. Reuses the shared status set.
  result: JenkinsBuildStatus | null;
  // 0-100 while RUNNING when Jenkins reports an estimate, else null.
  progress: number | null;
}

// One recorded run of a Jenkins job — the persisted history behind the
// client-side `JenkinsRunState`. Every trigger writes one of these, so a build is
// attributable and survives a reload. See docs/jenkins-sync.md.
export interface EnvironmentBuildRun {
  id: string;
  environmentId: string;
  // The record the build was started from, when it was started from one.
  portId: string | null;
  jobName: string;
  jobUrl: string;
  buildNumber: number | null;
  buildUrl: string;
  phase: JenkinsRunPhase;
  result: JenkinsBuildStatus | null;
  // The user id, for callers that need identity rather than a label.
  triggeredBy: string | null;
  // Who ran it, ready to render: name, else email, else "Unknown". Snapshotted at
  // trigger time because `profiles` is not readable across users.
  triggeredByLabel: string;
  startedAt: string;
  finishedAt: string | null;
}

// A port/CI-CD hint extracted best-effort from a job's config (D3).
export interface ExtractedPort {
  port: string;
  protocol: Protocol;
  description: string;
  foundIn: string; // which pattern matched, for transparency
}

// Why a port-like token in a job's config didn't become a record:
// - `out_of_range`: a pattern matched it, but it isn't a port (0, or over 65535).
// - `no_pattern`: it looks like a port (`host:3000`, `listen 80`, `"3000:3000"`)
//   but none of the extraction patterns claimed it.
export const PORT_SKIP_REASONS = ['out_of_range', 'no_pattern'] as const;
export type PortSkipReason = (typeof PORT_SKIP_REASONS)[number];

export const PORT_SKIP_REASON_LABELS: Record<PortSkipReason, string> = {
  out_of_range: 'Not a valid port (1–65535)',
  no_pattern: 'Looks like a port, but no pattern recognised it',
};

export interface SkippedPortCandidate {
  // The number as written in the config.
  token: string;
  reason: PortSkipReason;
  // The pattern that matched it, for `out_of_range`; the kind of hint that
  // spotted it, for `no_pattern`.
  foundIn: string;
  // The text around it, entity-decoded, so the reader can find it in the job.
  context: string;
}

// What extraction found in a job's config: the ports it could map, and every
// port-like token it saw and couldn't. "Nothing found" and "found things, mapped
// none" are different answers and must not read the same.
export interface PortExtraction {
  ports: ExtractedPort[];
  skipped: SkippedPortCandidate[];
}

// What a port sync *would* do, worked out before it writes anything (#33).
// Records are matched on port + protocol.
export interface PortSyncPlan {
  // Found in the job config, not yet a record: inserted on apply.
  added: ExtractedPort[];
  // Jenkins-sourced records the config still yields: left alone.
  unchanged: EnvironmentPort[];
  // Jenkins-sourced records the config no longer yields: **deleted** on apply.
  // The lossy part, so the preview calls them out.
  removed: EnvironmentPort[];
  // Records a sync never touches: typed by hand or imported from `docker ps`.
  kept: EnvironmentPort[];
  // Identifies this exact plan. Apply recomputes the plan and refuses if the
  // fingerprint changed, so it never writes something other than what was shown.
  fingerprint: string;
}

// The preview: the plan, plus what the config held that couldn't be mapped.
export interface PortSyncPreview extends PortSyncPlan {
  skipped: SkippedPortCandidate[];
}

// Result of applying a sync.
export interface EnvironmentSyncResult {
  added: number;
  removed: number;
  unchanged: number;
}

// Public (secret-free) per-environment Jenkins config for the modal. The token
// is replaced by a boolean — never sent to the browser.
// A VM's Jenkins server, as the tracker and the config dialog see it. A VM runs
// one Jenkins, so this is where the server, its user and its token live; an
// environment only names the *job* on it.
//
// Secret-free by construction: `hasToken` is a boolean, never the token.
export interface VmJenkinsConfig {
  vmId: string;
  baseUrl: string;
  username: string;
  hasToken: boolean;
}

export interface VmJenkinsInput {
  baseUrl: string;
  username: string;
  // Blank means "keep the token already stored". The dialog is never sent the
  // token, so it cannot send one back — an empty field has to mean unchanged.
  apiToken?: string;
}

// An environment's Jenkins setup, as its dialog sees it. The environment owns
// only its **job**; the server, user and token are its VM's (#84).
export interface EnvironmentJenkinsConfig {
  jenkinsUrl: string;
  // The VM's Jenkins server, or null when the environment has no VM or its VM
  // has none configured yet. Then the dialog says where to set it up.
  vmJenkins: (VmJenkinsConfig & { vmName: string }) | null;
  // The linked VM, so the dialog can link to where its server is set up.
  vmId: string | null;
  vmName: string;
}

// Write payload from the dialog: the job, and nothing else.
export interface EnvironmentJenkinsInput {
  jenkinsUrl: string;
}

// Where a Jenkins-linked record builds from, read live from its job's config.xml
// (see `extractScm`). Not stored: Jenkins is the source of truth for a job's
// repository and branch, and a copy here would silently go stale the day someone
// edits the job. Empty strings mean "not found in the config".
export interface JenkinsRecordSource {
  // Credentials stripped (`stripRepoCredentials`) before this leaves the server.
  repoUrl: string;
  branch: string;
  // Set when the branch came from a job parameter's default value, so the UI can
  // say a build may be run against a different one.
  branchParameter: string;
  // The Jenkinsfile path, for "Pipeline script from SCM" jobs.
  scriptPath: string;
}
