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
  // The queue item URL from the response's `Location` header — the handle on this
  // specific run. '' when Jenkins accepted the build but sent no Location.
  queueUrl: string;
  error?: string;
}

// Triggers a build of a job (POST {jobUrl}/build), attaching a CSRF crumb when
// the server issues one. 201/302 mean the build was queued.
//
// `redirect: 'manual'` is deliberate: it keeps the 3xx unfollowed so `Location`
// stays readable, which is where the queue item URL comes from.
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
    return { ok, status: res.status, queueUrl: ok ? (res.headers.get('location') ?? '') : '' };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      queueUrl: '',
      error: error instanceof Error ? error.message : 'network error',
    };
  }
};

// A queue item as Jenkins reports it. `executable` appears once an executor picks
// the item up, and carries the assigned build number. `cancelled` is set when the
// item was dropped before starting.
export interface QueueItemResult {
  ok: boolean;
  status: number;
  why: string | null;
  cancelled: boolean;
  executable: { number?: number; url?: string } | null;
  error?: string;
}

// Fetches a queue item. A 404 is expected and not an error condition: Jenkins
// only retains queue items for a few minutes after they leave the queue, so the
// caller treats it as "follow the build instead".
export const fetchQueueItem = async (
  auth: JenkinsAuth,
  queueUrl: string
): Promise<QueueItemResult> => {
  const empty = { why: null, cancelled: false, executable: null };
  try {
    const res = await fetch(`${stripTrailingSlash(queueUrl)}/api/json`, {
      headers: { Authorization: authHeader(auth), Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: res.status, ...empty };
    const json = (await res.json()) as {
      why?: string | null;
      cancelled?: boolean;
      executable?: { number?: number; url?: string } | null;
    };
    return {
      ok: true,
      status: res.status,
      why: json.why ?? null,
      cancelled: Boolean(json.cancelled),
      executable: json.executable ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ...empty,
      error: error instanceof Error ? error.message : 'network error',
    };
  }
};

// A single build's live state.
export interface BuildResult {
  ok: boolean;
  status: number;
  number: number | null;
  building: boolean;
  result: string | null;
  timestamp: number | null;
  estimatedDuration: number | null;
  error?: string;
}

// Fetches one build's state. `tree` keeps the payload to the six fields the run
// poller needs rather than Jenkins' full build document — this endpoint is polled
// repeatedly, so the response size matters.
export const fetchBuild = async (auth: JenkinsAuth, buildUrl: string): Promise<BuildResult> => {
  const empty = {
    number: null,
    building: false,
    result: null,
    timestamp: null,
    estimatedDuration: null,
  };
  try {
    const tree = 'number,building,result,timestamp,estimatedDuration';
    const res = await fetch(
      `${stripTrailingSlash(buildUrl)}/api/json?tree=${encodeURIComponent(tree)}`,
      {
        headers: { Authorization: authHeader(auth), Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      }
    );
    if (!res.ok) return { ok: false, status: res.status, ...empty };
    const json = (await res.json()) as {
      number?: number;
      building?: boolean;
      result?: string | null;
      timestamp?: number;
      estimatedDuration?: number;
    };
    return {
      ok: true,
      status: res.status,
      number: json.number ?? null,
      building: Boolean(json.building),
      result: json.result ?? null,
      timestamp: json.timestamp ?? null,
      estimatedDuration: json.estimatedDuration ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ...empty,
      error: error instanceof Error ? error.message : 'network error',
    };
  }
};
