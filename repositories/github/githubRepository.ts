// Repository layer — HTTP to the GitHub REST API. One of the documented
// exceptions to "repositories only touch Supabase" (AGENTS.md). No business
// rules: raw results, including the HTTP status, to the service layer.
//
// **Every request goes to `GITHUB_API`, a constant.** Nothing here takes a URL:
// callers pass path *segments*, which are encoded into a path on that fixed
// origin. So the token can only ever be sent to api.github.com — there is no
// user-supplied address for it to be redirected to (docs/security.md § SSRF).
// Pagination follows GitHub's `Link: rel="next"` header, and even that is only
// followed when it stays on the same origin.

const GITHUB_API = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 15_000;
// 10 × 100 = 1,000 items. A picker that needs more than that needs search, not a
// longer list; the bound is what stops a runaway listing.
const MAX_PAGES = 10;
const PER_PAGE = 100;

export interface GithubResult<T> {
  ok: boolean;
  // 0 = network error / timeout.
  status: number;
  data: T | null;
  error?: string;
}

// GitHub's own shapes, trimmed to what we read.
export interface GithubRawUser {
  login: string;
}
export interface GithubRawRepo {
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
  archived?: boolean;
}
export interface GithubRawBranch {
  name: string;
}

const headers = (token: string): HeadersInit => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'devops-portal',
});

const nextLink = (link: string | null): string | null => {
  const match = link?.match(/<([^>]+)>;\s*rel="next"/);
  if (!match) return null;
  try {
    const url = new URL(match[1]);
    return url.origin === GITHUB_API ? url.toString() : null;
  } catch {
    return null;
  }
};

const request = async (token: string, url: string): Promise<Response> =>
  fetch(url, {
    headers: headers(token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

const getOne = async <T>(token: string, path: string): Promise<GithubResult<T>> => {
  try {
    const res = await request(token, `${GITHUB_API}${path}`);
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : String(error) };
  }
};

const getAll = async <T>(token: string, path: string): Promise<GithubResult<T[]>> => {
  const out: T[] = [];
  let url: string | null = `${GITHUB_API}${path}${path.includes('?') ? '&' : '?'}per_page=${PER_PAGE}`;
  try {
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const res = await request(token, url);
      if (!res.ok) return { ok: false, status: res.status, data: null };
      out.push(...((await res.json()) as T[]));
      url = nextLink(res.headers.get('link'));
    }
    return { ok: true, status: 200, data: out };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : String(error) };
  }
};

// The account a token authenticates as — how a token is verified.
export const fetchGithubUser = (token: string) => getOne<GithubRawUser>(token, '/user');

// Every repository the token can see. For a fine-grained token that is exactly
// the set it was granted; for a classic one, everything its user can reach.
export const listGithubRepos = (token: string) =>
  getAll<GithubRawRepo>(token, '/user/repos?sort=full_name');

export const listGithubBranches = (token: string, owner: string, repo: string) =>
  getAll<GithubRawBranch>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`
  );
