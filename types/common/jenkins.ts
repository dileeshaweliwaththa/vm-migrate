import type { Protocol } from '@/types/common/vm';

// Domain types for the per-environment Jenkins integration (Phase 2b · M3). The
// non-secret parts (job URL, username) live on the environment; the secret token
// lives in environment_secrets and is only ever read server-side. See
// docs/jenkins-sync.md.

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

// Result of syncing one environment from its Jenkins job.
export interface EnvironmentSyncResult {
  ports: ExtractedPort[];
  written: number;
}

// Public (secret-free) per-environment Jenkins config for the modal. The token
// is replaced by a boolean — never sent to the browser.
// What another environment on the *same VM* already has configured, offered to an
// environment that has no credentials of its own. A VM runs one Jenkins, so the
// second environment on it shouldn't need the same server, user, and token typed
// again. Non-secret by construction: the server root and username, never the
// token — that is copied server-side on save and never travels to the browser.
// See docs/jenkins-sync.md § Inheriting a VM's Jenkins credentials.
export interface InheritedJenkinsConfig {
  // The VM both environments sit on — what makes the offer make sense to read.
  vmName: string;
  // The donor's *server root*, not its job URL: the job differs per environment.
  jenkinsBase: string;
  jenkinsUsername: string;
}

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

export interface EnvironmentJenkinsConfig {
  jenkinsUrl: string;
  jenkinsUsername: string;
  hasToken: boolean;
  // Null unless this environment has no token and its VM has one to lend.
  inherited: InheritedJenkinsConfig | null;
  // The **VM's own** Jenkins server, when this environment sits on a machine
  // that has one. This is where the server and credentials now live, so when it
  // is set the environment's dialog asks for nothing but the job — the three
  // credential fields would be a second place to maintain the same thing.
  vmJenkins: (VmJenkinsConfig & { vmName: string }) | null;
}

// Write payload from the modal. Token is only sent when (re)set; undefined keeps
// the stored value, empty string clears it.
export interface EnvironmentJenkinsInput {
  jenkinsUrl: string;
  jenkinsUsername: string;
  jenkinsApiToken?: string;
}
