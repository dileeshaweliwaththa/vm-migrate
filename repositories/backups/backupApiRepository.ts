// Repository layer: HTTP access to a backup service's API
// (`upview-db-backup-tracker`).
//
// This is the app's **second** external-HTTP data source, the documented
// exception to "repositories only touch Supabase" —
// `repositories/jenkins/jenkinsRepository.ts` is the first (architecture.md /
// AGENTS.md). Same rules: it builds requests, it reports what came back, and it
// decides nothing. The SSRF guard, the role checks and the mapping to domain
// types are the service layer's job.
//
// Nothing here throws. Every call answers with `{ ok, status, data, error }`
// because a backup host that is down, renamed or firewalled is an ordinary
// outcome the page has to render — not an exception to bubble up as a 500.

// Long enough for a slow dump listing over a VPN, short enough that a dead host
// doesn't hold a request open. A backup *run* is not awaited (see `runBackup`).
const REQUEST_TIMEOUT_MS = 15_000;

// A run can take minutes; the service answers only when the dump is finished, so
// the trigger gets its own, longer ceiling. The page follows progress through
// the log endpoint rather than this response.
const RUN_TIMEOUT_MS = 120_000;

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const request = async <T>(
  baseUrl: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<ApiResult<T>> => {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...rest } = init ?? {};
  try {
    const res = await fetch(`${stripTrailingSlash(baseUrl)}${path}`, {
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...rest.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });

    // The service answers JSON on every route, including its errors — but a
    // proxy in front of a dead container answers HTML, so a parse failure is
    // reported as such rather than crashing the route.
    const json = (await res.json().catch(() => null)) as T | null;
    return {
      ok: res.ok,
      status: res.status,
      data: json,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'network error',
    };
  }
};

// ---- shapes the service actually returns -----------------------------------
// Its JSON, verbatim and untrusted: this is another app's response, so the
// service layer normalizes and defaults everything rather than assuming a field
// is there.

export interface RawStatus {
  connected?: boolean;
  host?: string;
  port?: number;
  cronSchedule?: string;
  cronEnabled?: boolean;
  isBackupRunning?: boolean;
  azureEnabled?: boolean;
  azureContainerName?: string;
}

export interface RawBackup {
  id?: string;
  filename?: string;
  size?: number;
  timestamp?: string;
  databases?: string[];
  duration?: number;
  status?: string;
  error?: string | null;
  azureUploaded?: boolean;
  azureBlobUrl?: string | null;
  azureError?: string | null;
  triggerType?: string;
}

// The worker's `BackupProgress`, verbatim: a step type plus whatever that step
// measured. No message, no timestamp — see `describeBackupEvent`.
export interface RawLogEvent {
  type?: string;
  database?: string;
  index?: number;
  total?: number;
  size?: number;
  azureUploaded?: boolean;
  azureBlobUrl?: string;
  azureError?: string;
  error?: string;
}

export const fetchStatus = (baseUrl: string) => request<RawStatus>(baseUrl, '/api/status');

export const fetchDatabases = (baseUrl: string) =>
  request<{ success?: boolean; databases?: string[]; error?: string }>(baseUrl, '/api/databases');

export const fetchBackups = (baseUrl: string) =>
  request<{ success?: boolean; backups?: RawBackup[]; error?: string }>(baseUrl, '/api/backups');

export const fetchLogs = (baseUrl: string, since: number) =>
  request<{
    sessionId?: string;
    isRunning?: boolean;
    total?: number;
    events?: RawLogEvent[];
  }>(baseUrl, `/api/backup/logs?since=${encodeURIComponent(String(since))}`);

// Starts a dump. An empty `databases` means "all", which is the service's own
// default for a missing list.
export const runBackup = (baseUrl: string, databases: string[]) =>
  request<{ success?: boolean; records?: RawBackup[]; error?: string }>(baseUrl, '/api/backup', {
    method: 'POST',
    body: JSON.stringify({ databases }),
    timeoutMs: RUN_TIMEOUT_MS,
  });

// The dump file itself. This one returns the raw `Response` rather than parsed
// JSON: the body is a gzipped SQL stream — 64MB for the larger databases — so it
// is piped straight through to the caller and never buffered here.
//
// Returns null when the request could not be made at all, which the service
// reports as an unreachable worker.
export const downloadBackup = async (
  baseUrl: string,
  recordId: string
): Promise<Response | null> => {
  try {
    return await fetch(
      `${stripTrailingSlash(baseUrl)}/api/backups/${encodeURIComponent(recordId)}/download`,
      {
        // No `AbortSignal.timeout` here: the timeout would fire mid-stream on a
        // large file and truncate the download. The connection itself is the
        // bound.
        cache: 'no-store',
      }
    );
  } catch {
    return null;
  }
};

// The worker's live progress stream (Server-Sent Events).
//
// Returned as the raw `Response` so a route can pipe it straight to the browser:
// it never ends on its own, so there is nothing to parse or buffer here. No
// timeout for the same reason — the connection *is* the subscription.
//
// This is the channel that actually carries a run's progress. The worker's
// `/api/backup/logs` reads a MySQL table it writes to fire-and-forget (a failed
// insert is a warning on its console and nothing more), so on a deployment where
// those tables are missing it answers 200 with an empty list forever — which is
// what the worker's own log box shows too.
export const streamBackupEvents = async (baseUrl: string): Promise<Response | null> => {
  try {
    return await fetch(`${stripTrailingSlash(baseUrl)}/api/backup/events`, {
      headers: { Accept: 'text/event-stream' },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
};

export const reuploadBackup = (baseUrl: string, recordId: string) =>
  request<{ success?: boolean; url?: string; error?: string }>(
    baseUrl,
    `/api/backups/${encodeURIComponent(recordId)}/upload`,
    { method: 'POST' }
  );

export const deleteBackup = (baseUrl: string, recordId: string) =>
  request<{ success?: boolean; error?: string }>(
    baseUrl,
    `/api/backups/${encodeURIComponent(recordId)}`,
    { method: 'DELETE' }
  );

// The service's toggle takes no argument — it flips whatever the current state is
// and reports the result. The service layer is what turns "the user asked for
// off" into a call plus a check of what came back.
export const toggleCron = (baseUrl: string) =>
  request<{ success?: boolean; cronEnabled?: boolean }>(baseUrl, '/api/cron/toggle', {
    method: 'POST',
  });
