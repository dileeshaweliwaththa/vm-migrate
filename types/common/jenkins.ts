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
