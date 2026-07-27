import type { JenkinsAuth } from '@/types/common/jenkins';

// Repository layer — the ONE external-HTTP data source (the documented exception
// to "repositories only touch Supabase"; see architecture.md / AGENTS.md §2).
// Talks to a Jenkins job over HTTP Basic auth (username:apiToken). No business
// rules — raw results to the service layer.

const REQUEST_TIMEOUT_MS = 15_000;

const authHeader = (auth: JenkinsAuth): string =>
  `Basic ${Buffer.from(`${auth.username}:${auth.apiToken}`).toString('base64')}`;

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

// Fetches a job's config.xml (for best-effort port extraction, D3). Returns null
// on any error so an unreadable/misconfigured job produces a clear "couldn't
// read" result rather than throwing.
export const fetchJobConfigXml = async (
  auth: JenkinsAuth,
  jobUrl: string
): Promise<string | null> => {
  try {
    const res = await fetch(`${stripTrailingSlash(jobUrl)}/config.xml`, {
      headers: { Authorization: authHeader(auth) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
};
