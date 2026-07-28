import type { JenkinsAuth, JenkinsRawJob } from '@/types/common/jenkins';

// Repository layer — the ONE external-HTTP data source (the documented exception
// to "repositories only touch Supabase"; see architecture.md / AGENTS.md §2).
// Talks to a Jenkins job over HTTP Basic auth (username:apiToken). No business
// rules — raw results (including the HTTP status) to the service layer.

const REQUEST_TIMEOUT_MS = 15_000;

const authHeader = (auth: JenkinsAuth): string =>
  `Basic ${Buffer.from(`${auth.username}:${auth.apiToken}`).toString('base64')}`;

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

// Outcome of a config.xml fetch. `status` is the HTTP status (0 = network/URL
// error) so the service can explain auth (401) vs permission (403) vs wrong URL
// (404) precisely, instead of one catch-all message.
export interface JobConfigResult {
  ok: boolean;
  status: number;
  xml: string | null;
  error?: string;
}

// Fetches a job's config.xml (for best-effort port extraction, D3). Never
// throws — returns a structured result the service turns into a clear message.
export const fetchJobConfigXml = async (
  auth: JenkinsAuth,
  jobUrl: string
): Promise<JobConfigResult> => {
  if (!/^https?:\/\//i.test(jobUrl)) {
    return { ok: false, status: 0, xml: null, error: 'The Job URL must start with http:// or https://.' };
  }
  try {
    const res = await fetch(`${stripTrailingSlash(jobUrl)}/config.xml`, {
      headers: { Authorization: authHeader(auth) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: res.status, xml: null };
    return { ok: true, status: res.status, xml: await res.text() };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network error';
    return { ok: false, status: 0, xml: null, error: message };
  }
};

export interface ListJobsResult {
  ok: boolean;
  status: number;
  jobs: JenkinsRawJob[];
  error?: string;
}

// Lists jobs from a Jenkins server root, three folder levels deep, including the
// last completed build and description in a single call.
export const listAllJobs = async (
  auth: JenkinsAuth,
  baseUrl: string
): Promise<ListJobsResult> => {
  const leaf = 'name,url,color,description,lastCompletedBuild[number,result,timestamp]';
  const tree = `jobs[${leaf},jobs[${leaf},jobs[${leaf}]]]`;
  try {
    const res = await fetch(`${stripTrailingSlash(baseUrl)}/api/json?tree=${encodeURIComponent(tree)}`, {
      headers: { Authorization: authHeader(auth), Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: res.status, jobs: [] };
    const json = (await res.json()) as { jobs?: JenkinsRawJob[] };
    return { ok: true, status: res.status, jobs: json.jobs ?? [] };
  } catch (error) {
    return { ok: false, status: 0, jobs: [], error: error instanceof Error ? error.message : 'network error' };
  }
};

// Fetches a CSRF crumb if the server requires one. Returns null when crumbs are
// disabled or unavailable (API-token requests are typically crumb-exempt).
const getCrumb = async (
  auth: JenkinsAuth,
  baseUrl: string
): Promise<{ field: string; value: string } | null> => {
  try {
    const res = await fetch(`${stripTrailingSlash(baseUrl)}/crumbIssuer/api/json`, {
      headers: { Authorization: authHeader(auth), Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { crumbRequestField?: string; crumb?: string };
    if (!json.crumbRequestField || !json.crumb) return null;
    return { field: json.crumbRequestField, value: json.crumb };
  } catch {
    return null;
  }
};

export interface TriggerResult {
  ok: boolean;
  status: number;
  error?: string;
}

// Triggers a build of a job (POST {jobUrl}/build), attaching a CSRF crumb when
// the server issues one. 201/302 mean the build was queued.
export const triggerBuild = async (
  auth: JenkinsAuth,
  baseUrl: string,
  jobUrl: string
): Promise<TriggerResult> => {
  try {
    const crumb = await getCrumb(auth, baseUrl);
    const headers: Record<string, string> = { Authorization: authHeader(auth) };
    if (crumb) headers[crumb.field] = crumb.value;
    const res = await fetch(`${stripTrailingSlash(jobUrl)}/build`, {
      method: 'POST',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    // Jenkins returns 201 (Created) or a 3xx redirect to the queue item.
    const ok = res.status === 201 || (res.status >= 300 && res.status < 400) || res.status === 200;
    return { ok, status: res.status };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : 'network error' };
  }
};
