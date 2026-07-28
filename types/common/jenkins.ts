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
  message: string;
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
export interface EnvironmentJenkinsConfig {
  jenkinsUrl: string;
  jenkinsUsername: string;
  hasToken: boolean;
}

// Write payload from the modal. Token is only sent when (re)set; undefined keeps
// the stored value, empty string clears it.
export interface EnvironmentJenkinsInput {
  jenkinsUrl: string;
  jenkinsUsername: string;
  jenkinsApiToken?: string;
}
