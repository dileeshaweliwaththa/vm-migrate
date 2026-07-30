import { getCurrentRole } from '@/services/auth/authService';
import { getProject } from '@/services/projects/projectService';
import { extractPorts } from '@/services/jenkins/extraction';
import {
  fetchBuild,
  fetchJobConfigXml,
  fetchQueueItem,
  listAllJobs,
  triggerBuild,
} from '@/repositories/jenkins/jenkinsRepository';
import { updateEnvironment } from '@/repositories/environments/environmentRepository';
import {
  getEnvironmentToken,
  setEnvironmentToken,
  hasEnvironmentToken,
} from '@/repositories/environmentSecrets/environmentSecretRepository';
import { insertPort, deletePort } from '@/repositories/environmentPorts/environmentPortRepository';
import { canEdit } from '@/lib/rbac';
import type { ApiSingleResponse } from '@/types/common';
import type {
  EnvironmentJenkinsConfig,
  EnvironmentJenkinsInput,
  EnvironmentSyncResult,
  JenkinsAuth,
  JenkinsBuildStatus,
  JenkinsJobSummary,
  JenkinsRawJob,
  JenkinsRunState,
  TriggerBuildResult,
} from '@/types/common/jenkins';
import type { Environment } from '@/types/common/project';

// Service layer: per-environment Jenkins integration (Phase 2b · M3). Editor+.
//
// Non-secret config (job URL, username) is stored on the environment; the secret
// API token is stored in environment_secrets and only ever read/written here via
// the service-role repository — it is never returned to the browser. The sync
// reads the environment's own job config and refreshes its jenkins-sourced ports
// (manual ports are preserved). See docs/jenkins-sync.md.

const asMsg = (error: unknown, fallback: string): string =>
  (error instanceof Error && error.message) || fallback;

// Turns a config.xml fetch outcome into a precise, actionable message.
const configErrorMessage = (status: number, error?: string, username?: string): string => {
  switch (status) {
    case 401:
      return `Jenkins rejected the credentials (401)${
        username ? ` for user “${username}”` : ' — no username is set'
      }. The API token must be paired with the exact Jenkins user it belongs to (Basic auth = username:token).`;
    case 403:
      return 'Jenkins denied access to the job config (403). The user needs “Job → Extended Read” (or Admin) permission to read config.xml.';
    case 404:
      return 'Jenkins job not found (404). Make sure the Job URL points to a job (e.g. https://jenkins…/job/NAME/).';
    case 0:
      return `Couldn’t reach Jenkins${error ? ` — ${error}` : ''}. Check the Job URL and that the server is reachable.`;
    default:
      return `Jenkins returned HTTP ${status} reading the job config. Check the URL, credentials, and permissions.`;
  }
};

const findEnv = async (
  projectId: string,
  envId: string
): Promise<Environment | undefined> => {
  const detail = await getProject(projectId);
  return detail?.environments.find((e) => e.id === envId);
};

// Derives the Jenkins server root from a job URL (handles context paths and
// plain roots): everything before "/job/", else the URL itself.
const deriveBase = (jobUrl: string): string => {
  const trimmed = jobUrl.trim().replace(/\/+$/, '');
  const idx = trimmed.indexOf('/job/');
  return idx > -1 ? trimmed.slice(0, idx) : trimmed;
};

const RESULT_MAP: Record<string, JenkinsBuildStatus> = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILED',
  UNSTABLE: 'UNSTABLE',
  ABORTED: 'ABORTED',
  NOT_BUILT: 'NOT_BUILT',
};
const COLOR_MAP: Record<string, JenkinsBuildStatus> = {
  blue: 'SUCCESS',
  green: 'SUCCESS',
  red: 'FAILED',
  yellow: 'UNSTABLE',
  aborted: 'ABORTED',
  disabled: 'DISABLED',
  grey: 'PENDING',
  notbuilt: 'NOT_BUILT',
  nobuilt: 'NOT_BUILT',
};

const jobStatus = (job: JenkinsRawJob): { status: JenkinsBuildStatus; building: boolean } => {
  const color = job.color ?? '';
  const building = color.endsWith('_anime');
  const result = job.lastCompletedBuild?.result;
  const status =
    (result && RESULT_MAP[result]) || COLOR_MAP[color.replace('_anime', '')] || 'UNKNOWN';
  return { status, building };
};

// Flattens the nested job tree into runnable-job summaries (leaves), carrying a
// human folder path. Nodes with children are folders/multibranch — recurse.
const flattenJobs = (jobs: JenkinsRawJob[], prefix = ''): JenkinsJobSummary[] => {
  const out: JenkinsJobSummary[] = [];
  for (const job of jobs) {
    const name = job.name ?? '';
    const path = prefix ? `${prefix} / ${name}` : name;
    if (job.jobs && job.jobs.length > 0) {
      out.push(...flattenJobs(job.jobs, path));
    } else if (job.url) {
      const { status, building } = jobStatus(job);
      const ts = job.lastCompletedBuild?.timestamp;
      out.push({
        name,
        path,
        url: job.url,
        status,
        building,
        lastBuildNumber: job.lastCompletedBuild?.number ?? null,
        lastBuildAt: ts ? new Date(ts).toISOString() : null,
        description: job.description ?? '',
      });
    }
  }
  return out;
};

// Resolves an environment's Jenkins auth + server base, or a clear error.
type ResolvedJenkins = { env: Environment; auth: JenkinsAuth; base: string };
const resolveEnvJenkins = async (
  projectId: string,
  envId: string
): Promise<{ ok: true; value: ResolvedJenkins } | { ok: false; message: string }> => {
  const env = await findEnv(projectId, envId);
  if (!env) return { ok: false, message: 'Environment not found.' };
  if (!env.jenkinsUrl.trim()) {
    return { ok: false, message: 'Set the Jenkins URL first (Jenkins settings).' };
  }
  const apiToken = (await getEnvironmentToken(envId)).trim();
  if (!apiToken) return { ok: false, message: 'No Jenkins API token set for this environment.' };
  const username = env.jenkinsUsername.trim();
  if (!username) {
    return { ok: false, message: 'Set the Jenkins username (the token must be paired with its user).' };
  }
  return { ok: true, value: { env, auth: { username, apiToken }, base: deriveBase(env.jenkinsUrl) } };
};

// Public, secret-free config for the modal (token replaced by a boolean).
export const getEnvironmentJenkinsConfig = async (
  projectId: string,
  envId: string
): Promise<ApiSingleResponse<EnvironmentJenkinsConfig>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  const env = await findEnv(projectId, envId);
  if (!env) return { success: false, message: 'Environment not found.', data: null };

  try {
    const hasToken = await hasEnvironmentToken(envId);
    return {
      success: true,
      message: 'OK',
      data: { jenkinsUrl: env.jenkinsUrl, jenkinsUsername: env.jenkinsUsername, hasToken },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to load Jenkins config.'), data: null };
  }
};

export const saveEnvironmentJenkinsConfig = async (
  projectId: string,
  envId: string,
  input: EnvironmentJenkinsInput
): Promise<ApiSingleResponse<EnvironmentJenkinsConfig>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  const env = await findEnv(projectId, envId);
  if (!env) return { success: false, message: 'Environment not found.', data: null };

  try {
    // Non-secret parts on the environment; ensure the provider reflects Jenkins.
    await updateEnvironment(envId, {
      jenkins_url: input.jenkinsUrl.trim(),
      jenkins_username: input.jenkinsUsername.trim(),
      cicd_provider: 'jenkins',
    });
    // Secret token: only write when provided (undefined = keep stored value).
    if (input.jenkinsApiToken !== undefined) {
      await setEnvironmentToken(envId, input.jenkinsApiToken.trim());
    }
    const hasToken = await hasEnvironmentToken(envId);
    return {
      success: true,
      message: 'Jenkins settings saved.',
      data: {
        jenkinsUrl: input.jenkinsUrl.trim(),
        jenkinsUsername: input.jenkinsUsername.trim(),
        hasToken,
      },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to save Jenkins config.'), data: null };
  }
};

// Per-environment sync (editor+). Reads the environment's own Jenkins job URL +
// username, and the token from the server-only secrets store, pulls the job
// config, extracts ports best-effort, and replaces only the `jenkins`-sourced
// ports (manual entries preserved). The token is never exposed to the client.
export const syncEnvironmentPorts = async (
  projectId: string,
  envId: string
): Promise<ApiSingleResponse<EnvironmentSyncResult>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  const env = await findEnv(projectId, envId);
  if (!env) return { success: false, message: 'Environment not found.', data: null };
  if (!env.jenkinsUrl.trim()) {
    return { success: false, message: 'Set the Jenkins job URL first (Jenkins settings).', data: null };
  }

  try {
    // Re-trim on read: guards against a stray space/newline pasted into the
    // token or username field that would otherwise silently 401.
    const apiToken = (await getEnvironmentToken(envId)).trim();
    if (!apiToken) {
      return { success: false, message: 'No Jenkins API token set for this environment.', data: null };
    }
    const username = env.jenkinsUsername.trim();
    if (!username) {
      return {
        success: false,
        message:
          'Set the Jenkins username. A Jenkins API token only authenticates when sent with the username that owns it (Basic auth = username:token).',
        data: null,
      };
    }

    const result = await fetchJobConfigXml({ username, apiToken }, env.jenkinsUrl);
    if (!result.ok || result.xml === null) {
      return { success: false, message: configErrorMessage(result.status, result.error, username), data: null };
    }

    const ports = extractPorts(result.xml);

    // Replace only the jenkins-sourced ports; keep manual ones.
    for (const p of env.ports.filter((p) => p.source === 'jenkins')) {
      await deletePort(p.id);
    }
    let position = env.ports.filter((p) => p.source !== 'jenkins').length;
    for (const p of ports) {
      await insertPort({
        environment_id: envId,
        port: p.port,
        protocol: p.protocol,
        description: p.description,
        source: 'jenkins',
        position: position++,
      });
    }

    return {
      success: true,
      message: ports.length
        ? `Synced ${ports.length} port(s) from Jenkins.`
        : 'Connected, but no ports were detected in the job config.',
      data: { ports, written: ports.length },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Jenkins sync failed.'), data: null };
  }
};

// Lists all jobs on the environment's Jenkins server (editor+). The server root
// is derived from the environment's Jenkins URL, so setting just the base URL is
// enough to browse and then pick a specific job.
export const listJenkinsJobs = async (
  projectId: string,
  envId: string
): Promise<ApiSingleResponse<JenkinsJobSummary[]>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  try {
    const resolved = await resolveEnvJenkins(projectId, envId);
    if (!resolved.ok) return { success: false, message: resolved.message, data: null };

    const { auth, base } = resolved.value;
    const res = await listAllJobs(auth, base);
    if (!res.ok) {
      return { success: false, message: configErrorMessage(res.status, res.error, auth.username), data: null };
    }
    const jobs = flattenJobs(res.jobs).sort((a, b) => a.path.localeCompare(b.path));
    return { success: true, message: 'OK', data: jobs };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to load Jenkins jobs.'), data: null };
  }
};

// Triggers a build of a job on the environment's Jenkins server (editor+). The
// jobUrl must belong to that same server (SSRF guard).
export const triggerJenkinsBuild = async (
  projectId: string,
  envId: string,
  jobUrl: string
): Promise<ApiSingleResponse<TriggerBuildResult>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  try {
    const resolved = await resolveEnvJenkins(projectId, envId);
    if (!resolved.ok) return { success: false, message: resolved.message, data: null };

    const { auth, base } = resolved.value;
    if (!jobUrl || !jobUrl.startsWith(base)) {
      return {
        success: false,
        message: 'That job URL doesn’t belong to this Jenkins server.',
        data: null,
      };
    }

    const res = await triggerBuild(auth, base, jobUrl);
    if (!res.ok) {
      const message =
        res.status === 403
          ? 'Jenkins denied the build (403). The token’s user needs “Job → Build” permission.'
          : res.status === 409
            ? 'Jenkins refused the build (409) — the job may be disabled.'
            : res.status === 0
              ? `Couldn’t reach Jenkins${res.error ? ` — ${res.error}` : ''}.`
              : `Jenkins returned HTTP ${res.status} triggering the build.`;
      return { success: false, message, data: null };
    }
    // The queue URL is what lets the caller follow *this* run. Jenkins normally
    // sends it; if it didn't, the build still queued — the caller just can't
    // track it individually and falls back to the job list's coarse state.
    return {
      success: true,
      message: 'Build queued in Jenkins.',
      data: { queued: true, queueUrl: res.queueUrl },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to trigger the build.'), data: null };
  }
};

// Percentage complete while a build runs, from Jenkins' own estimate. Capped at
// 99 so a long-running build never sits at a misleading 100%.
const runProgress = (timestamp: number | null, estimatedDuration: number | null): number | null => {
  if (!timestamp || !estimatedDuration || estimatedDuration <= 0) return null;
  const elapsed = Date.now() - timestamp;
  if (elapsed <= 0) return 0;
  return Math.min(99, Math.round((elapsed / estimatedDuration) * 100));
};

const unknownRun: JenkinsRunState = {
  phase: 'UNKNOWN',
  reason: '',
  buildNumber: null,
  buildUrl: '',
  result: null,
  progress: null,
};

// Reads one build and maps it to a run state. Shared by both entry paths (a
// build URL passed straight in, and a queue item that has resolved to one).
const buildRunState = async (
  auth: JenkinsAuth,
  buildUrl: string,
  buildNumber: number | null
): Promise<JenkinsRunState> => {
  const build = await fetchBuild(auth, buildUrl);
  // A build that has vanished (404) or an unreachable server is UNKNOWN — the
  // poller stops rather than retrying forever.
  if (!build.ok) return { ...unknownRun, buildUrl };

  const number = build.number ?? buildNumber;
  if (build.building || !build.result) {
    return {
      phase: 'RUNNING',
      reason: '',
      buildNumber: number,
      buildUrl,
      result: null,
      progress: runProgress(build.timestamp, build.estimatedDuration),
    };
  }
  return {
    phase: 'DONE',
    reason: '',
    buildNumber: number,
    buildUrl,
    result: RESULT_MAP[build.result] ?? 'UNKNOWN',
    progress: null,
  };
};

// Where a triggered run currently is (editor+). Collapses Jenkins' two-phase
// queue→build model into one JenkinsRunState so the client polls a single
// endpoint and never has to know about queue items.
//
// Pass `buildUrl` once known — queue items are only retained for a few minutes
// after they leave the queue, whereas a build URL stays valid indefinitely.
export const getJenkinsRunState = async (
  projectId: string,
  envId: string,
  ref: { queueUrl?: string; buildUrl?: string }
): Promise<ApiSingleResponse<JenkinsRunState>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  try {
    const resolved = await resolveEnvJenkins(projectId, envId);
    if (!resolved.ok) return { success: false, message: resolved.message, data: null };
    const { auth, base } = resolved.value;

    // The URLs arrive from the client, so both are checked against this
    // environment's own Jenkins root before any request is made with the token
    // attached — otherwise this endpoint would fetch arbitrary URLs on request.
    const belongs = (url?: string): boolean => Boolean(url && url.startsWith(base));

    if (belongs(ref.buildUrl)) {
      const data = await buildRunState(auth, ref.buildUrl as string, null);
      return { success: true, message: 'OK', data };
    }

    if (!belongs(ref.queueUrl)) {
      return {
        success: false,
        message: 'That build reference doesn’t belong to this Jenkins server.',
        data: null,
      };
    }

    const item = await fetchQueueItem(auth, ref.queueUrl as string);
    // 404 = the queue item has already expired. Nothing further to follow.
    if (!item.ok) return { success: true, message: 'OK', data: unknownRun };
    if (item.cancelled) {
      return { success: true, message: 'OK', data: { ...unknownRun, phase: 'CANCELLED' } };
    }

    const buildUrl = item.executable?.url ?? '';
    if (!buildUrl || !belongs(buildUrl)) {
      return {
        success: true,
        message: 'OK',
        data: {
          ...unknownRun,
          phase: 'QUEUED',
          reason: item.why ?? 'Waiting for an available executor…',
        },
      };
    }

    // It has an executor. Read the build in the same request so the first poll
    // after start already carries the number and progress — no extra round trip.
    const data = await buildRunState(auth, buildUrl, item.executable?.number ?? null);
    return { success: true, message: 'OK', data };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to read the build state.'), data: null };
  }
};

// Links a chosen job to the environment: sets its Jenkins URL and (optionally)
// copies the job description into the environment notes. Editor+. The jobUrl
// must belong to the same server the environment already points at.
export const linkJenkinsJob = async (
  projectId: string,
  envId: string,
  jobUrl: string,
  description: string
): Promise<ApiSingleResponse<{ jenkinsUrl: string }>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  const env = await findEnv(projectId, envId);
  if (!env) return { success: false, message: 'Environment not found.', data: null };

  const base = deriveBase(env.jenkinsUrl);
  if (!base || !jobUrl.startsWith(base)) {
    return { success: false, message: 'That job URL doesn’t belong to this Jenkins server.', data: null };
  }

  try {
    await updateEnvironment(envId, {
      jenkins_url: jobUrl,
      cicd_provider: 'jenkins',
      ...(description.trim() ? { notes: description.trim() } : {}),
    });
    return { success: true, message: 'Job linked to this environment.', data: { jenkinsUrl: jobUrl } };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to link the job.'), data: null };
  }
};
