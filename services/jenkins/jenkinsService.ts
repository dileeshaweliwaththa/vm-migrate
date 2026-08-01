import { getCurrentActor, getCurrentRole, type CurrentActor } from '@/services/auth/authService';
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
import {
  findBuildRuns,
  insertBuildRun,
  updateBuildRunByRef,
  type BuildRunWriteColumns,
} from '@/repositories/environmentBuildRuns/environmentBuildRunRepository';
import { canEdit, canRunBuild } from '@/lib/rbac';
import type { ApiSingleResponse } from '@/types/common';
import type {
  EnvironmentBuildRun,
  EnvironmentJenkinsConfig,
  EnvironmentJenkinsInput,
  EnvironmentSyncResult,
  JenkinsAuth,
  JenkinsBuildStatus,
  JenkinsJobSummary,
  JenkinsRawJob,
  JenkinsRunPhase,
  JenkinsRunState,
  TriggerBuildResult,
} from '@/types/common/jenkins';
import { isTerminalRunPhase } from '@/types/common/jenkins';
import type { EnvironmentBuildRunRow } from '@/types/supabase/response/environmentBuildRuns';
import type { Environment } from '@/types/common/project';

// Service layer: per-environment Jenkins integration (Phase 2b · M3).
//
// Two access levels live here. **Configuration** (credentials, linking a job,
// syncing ports) is editor+. **Running** a build — triggering it, following it,
// and reading job status/history — is open to every signed-in role, viewers
// included, because each run is recorded against the user who started it in
// `environment_build_runs`. See lib/rbac.ts and docs/jenkins-sync.md.
//
// Non-secret config (job URL, username) is stored on the environment; the secret
// API token is stored in environment_secrets and only ever read/written here via
// the service-role repository — it is never returned to the browser. The sync
// reads the environment's own job config and refreshes its jenkins-sourced ports
// (manual ports are preserved).

const asMsg = (error: unknown, fallback: string): string =>
  (error instanceof Error && error.message) || fallback;

// Denial messages. Routes map anything ending in "access required." to a 403.
const EDITOR_REQUIRED = 'Editor access required.';
const SIGN_IN_REQUIRED = 'Authenticated access required.';

// Newest-first history is a list, not a feed — a card only ever shows the recent
// runs of one environment, so it is bounded here rather than paginated.
const BUILD_HISTORY_LIMIT = 50;

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
  if (!canEdit(role)) return { success: false, message: EDITOR_REQUIRED, data: null };

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
  if (!canEdit(role)) return { success: false, message: EDITOR_REQUIRED, data: null };

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
  if (!canEdit(role)) return { success: false, message: EDITOR_REQUIRED, data: null };

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

// Lists all jobs on the environment's Jenkins server (any signed-in role). The
// server root is derived from the environment's Jenkins URL, so setting just the
// base URL is enough to browse and then pick a specific job.
//
// Open to viewers because this listing is also what fills the Status and Last
// build columns of the records table — read-only information about jobs the
// environment already points at.
export const listJenkinsJobs = async (
  projectId: string,
  envId: string
): Promise<ApiSingleResponse<JenkinsJobSummary[]>> => {
  const role = await getCurrentRole();
  if (!canRunBuild(role)) return { success: false, message: SIGN_IN_REQUIRED, data: null };

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

// Derives a display name for a job from its URL — the last `/job/<name>` segment,
// URL-decoded. Used when a build wasn't started from a record that already
// carries the job's name.
const jobNameFromUrl = (jobUrl: string): string => {
  const parts = jobUrl.replace(/\/+$/, '').split('/job/');
  const last = parts[parts.length - 1] ?? '';
  return decodeURIComponent(last.split('/')[0] ?? '') || jobUrl;
};

// Writes the history row for a build that Jenkins has just accepted: who ran it,
// which job, and the queue handle the poller will follow.
//
// Best-effort on purpose. The build is *already queued in Jenkins* by the time
// this runs, so a failed audit write must not turn a successful trigger into an
// error — that would tell the user their (running) build didn't start.
const recordTriggeredRun = async (
  actor: CurrentActor,
  env: Environment,
  jobUrl: string,
  queueUrl: string
): Promise<void> => {
  const port = env.ports.find((p) => p.jenkinsJobUrl === jobUrl);
  try {
    await insertBuildRun({
      environment_id: env.id,
      port_id: port?.id ?? null,
      job_url: jobUrl,
      job_name: port?.description || jobNameFromUrl(jobUrl),
      queue_url: queueUrl,
      phase: 'QUEUED',
      triggered_by: actor.id,
      triggered_by_email: actor.email,
      triggered_by_name: actor.name,
    });
  } catch {
    // Nothing the caller can do about it, and nothing to report.
  }
};

// Triggers a build of a job on the environment's Jenkins server. Open to any
// signed-in role — the run is attributed in `environment_build_runs`. The jobUrl
// must belong to that same server (SSRF guard).
export const triggerJenkinsBuild = async (
  projectId: string,
  envId: string,
  jobUrl: string
): Promise<ApiSingleResponse<TriggerBuildResult>> => {
  // One session read: the trigger both gates on the role and stamps the run with
  // the user who started it.
  const actor = await getCurrentActor();
  if (!actor || !canRunBuild(actor.role)) {
    return { success: false, message: SIGN_IN_REQUIRED, data: null };
  }

  try {
    const resolved = await resolveEnvJenkins(projectId, envId);
    if (!resolved.ok) return { success: false, message: resolved.message, data: null };

    const { env, auth, base } = resolved.value;
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
    // track it individually and falls back to the job list's coarse state. The
    // history row is written either way: who ran what is worth recording even
    // when the run itself can't be followed to a result.
    await recordTriggeredRun(actor, env, jobUrl, res.queueUrl);

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

// Mirrors a poll of a live run onto its history row, so the record ends up with
// the build number and the final result instead of sitting at QUEUED — that's
// what makes the history readable after a reload, and by other users.
//
// Matched by whichever handle the poller currently holds. UNKNOWN is skipped: it
// means Jenkins no longer knows about the run (an expired queue item), which
// teaches us nothing and would erase a result already recorded.
const syncRunHistory = async (
  ref: { queueUrl?: string; buildUrl?: string },
  state: JenkinsRunState
): Promise<void> => {
  if (state.phase === 'UNKNOWN') return;
  // Empty strings would match every row that has no such handle yet.
  const match = ref.buildUrl
    ? ({ build_url: ref.buildUrl } as const)
    : ref.queueUrl
      ? ({ queue_url: ref.queueUrl } as const)
      : null;
  if (!match) return;

  const values: BuildRunWriteColumns = {
    phase: state.phase,
    result: state.result,
    build_number: state.buildNumber,
    finished_at: isTerminalRunPhase(state.phase) ? new Date().toISOString() : null,
    // Recorded as soon as the queue item resolves, so later polls (and the
    // history list) can find the run by its build.
    ...(state.buildUrl ? { build_url: state.buildUrl } : {}),
  };
  try {
    await updateBuildRunByRef(match, values);
  } catch {
    // History is a side-effect of the poll, never its purpose.
  }
};

// Where a triggered run currently is (any signed-in role). Collapses Jenkins'
// two-phase queue→build model into one JenkinsRunState so the client polls a
// single endpoint and never has to know about queue items.
//
// Pass `buildUrl` once known — queue items are only retained for a few minutes
// after they leave the queue, whereas a build URL stays valid indefinitely.
export const getJenkinsRunState = async (
  projectId: string,
  envId: string,
  ref: { queueUrl?: string; buildUrl?: string }
): Promise<ApiSingleResponse<JenkinsRunState>> => {
  const role = await getCurrentRole();
  if (!canRunBuild(role)) return { success: false, message: SIGN_IN_REQUIRED, data: null };

  try {
    const resolved = await resolveEnvJenkins(projectId, envId);
    if (!resolved.ok) return { success: false, message: resolved.message, data: null };
    const { auth, base } = resolved.value;

    // The URLs arrive from the client, so both are checked against this
    // environment's own Jenkins root before any request is made with the token
    // attached — otherwise this endpoint would fetch arbitrary URLs on request.
    const belongs = (url?: string): boolean => Boolean(url && url.startsWith(base));

    // Every successful poll below also lands on the run's history row, so a
    // record ends with the build number and result it actually reached.
    const ok = async (data: JenkinsRunState): Promise<ApiSingleResponse<JenkinsRunState>> => {
      await syncRunHistory(ref, data);
      return { success: true, message: 'OK', data };
    };

    if (belongs(ref.buildUrl)) {
      return ok(await buildRunState(auth, ref.buildUrl as string, null));
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
    if (!item.ok) return ok(unknownRun);
    if (item.cancelled) return ok({ ...unknownRun, phase: 'CANCELLED' });

    const buildUrl = item.executable?.url ?? '';
    if (!buildUrl || !belongs(buildUrl)) {
      return ok({
        ...unknownRun,
        phase: 'QUEUED',
        reason: item.why ?? 'Waiting for an available executor…',
      });
    }

    // It has an executor. Read the build in the same request so the first poll
    // after start already carries the number and progress — no extra round trip.
    return ok(await buildRunState(auth, buildUrl, item.executable?.number ?? null));
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to read the build state.'), data: null };
  }
};

const rowToBuildRun = (row: EnvironmentBuildRunRow): EnvironmentBuildRun => ({
  id: row.id,
  environmentId: row.environment_id,
  portId: row.port_id,
  jobName: row.job_name,
  jobUrl: row.job_url,
  buildNumber: row.build_number,
  buildUrl: row.build_url,
  phase: row.phase as JenkinsRunPhase,
  result: (row.result as JenkinsBuildStatus | null) ?? null,
  triggeredBy: row.triggered_by,
  // Snapshotted at trigger time — see the migration for why this isn't a join.
  triggeredByLabel: row.triggered_by_name || row.triggered_by_email || 'Unknown user',
  startedAt: row.created_at,
  finishedAt: row.finished_at,
});

// Recent builds, newest first: which job, who started it, and how it ended.
// Scoped to one **record** when `portId` is given — that's how the UI surfaces it,
// since a run belongs to the row it was started from — and to the whole
// environment otherwise. Readable by any signed-in role: the point of the trail is
// that the whole team can see who ran what. No Jenkins call; this is our own data.
export const listEnvironmentBuildRuns = async (
  projectId: string,
  envId: string,
  portId?: string
): Promise<ApiSingleResponse<EnvironmentBuildRun[]>> => {
  const role = await getCurrentRole();
  if (!canRunBuild(role)) return { success: false, message: SIGN_IN_REQUIRED, data: null };

  // Scopes the read to an environment of *this* project, so a valid envId from
  // another project can't be read through this project's route.
  const env = await findEnv(projectId, envId);
  if (!env) return { success: false, message: 'Environment not found.', data: null };
  // Same for the record: it has to be one of this environment's own.
  if (portId && !env.ports.some((p) => p.id === portId)) {
    return { success: false, message: 'Record not found.', data: null };
  }

  try {
    const rows = await findBuildRuns(envId, BUILD_HISTORY_LIMIT, portId);
    return { success: true, message: 'OK', data: rows.map(rowToBuildRun) };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to load the build history.'), data: null };
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
  if (!canEdit(role)) return { success: false, message: EDITOR_REQUIRED, data: null };

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
