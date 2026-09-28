import { getCurrentRole } from '@/services/auth/authService';
import {
  fetchGithubUser,
  listGithubBranches as fetchBranches,
  listGithubRepos as fetchRepos,
} from '@/repositories/github/githubRepository';
import {
  findGithubSecret,
  upsertGithubSecret,
} from '@/repositories/githubSecrets/githubSecretRepository';
import { canEdit, isAdmin } from '@/lib/rbac';
import type { ApiSingleResponse } from '@/types/common';
import type {
  GithubBranchList,
  GithubRepoList,
  GithubStatus,
  GithubTestResult,
} from '@/types/common/github';

// Service layer: the app's GitHub connection (docs/github.md).
//
// Two access levels. **Configuring** the token is admin-only — it's app-wide
// configuration, like the Gemini key. **Using** it (listing repositories and
// branches for the record source picker) is editor+, because only editors can set
// a record's source. The token is read through the service-role repository and
// only ever used to sign a request to api.github.com; it is never returned.

const ADMIN_REQUIRED = 'Admin access required.';
const EDITOR_REQUIRED = 'Editor access required.';

// `owner` and `repo` segments as GitHub allows them. Checked before a branch
// listing so the path can't be steered anywhere else on the API.
const REPO_SEGMENT = /^[A-Za-z0-9_.-]+$/;

// PostgREST's answer when `github_secrets` doesn't exist — the migration that
// creates it hasn't been applied to this database yet. Worth its own message: the
// raw one ("…in the schema cache") doesn't say what to do.
const MISSING_TABLE = /could not find the table .*github_secrets/i;

const asMsg = (error: unknown, fallback: string): string => {
  const message = (error instanceof Error && error.message) || fallback;
  return MISSING_TABLE.test(message)
    ? 'The GitHub connection table doesn’t exist yet — apply the database migrations (`supabase db push`), then reload.'
    : message;
};

// Turns a GitHub HTTP status into what to do about it.
const githubErrorMessage = (status: number, error?: string): string => {
  switch (status) {
    case 401:
      return 'GitHub rejected the token (401) — it may have expired or been revoked. Set a new one in Settings.';
    case 403:
      return 'GitHub refused the request (403). The token may lack access, or the organisation hasn’t approved it yet.';
    case 404:
      return 'GitHub couldn’t find that repository (404) — or the token isn’t granted access to it.';
    case 0:
      return `Couldn’t reach GitHub${error ? ` — ${error}` : ''}.`;
    default:
      return `GitHub returned HTTP ${status}.`;
  }
};

const storedToken = async (): Promise<string> =>
  ((await findGithubSecret())?.access_token ?? '').trim();

export const getGithubStatus = async (): Promise<ApiSingleResponse<GithubStatus>> => {
  if (!isAdmin(await getCurrentRole())) return { success: false, message: ADMIN_REQUIRED, data: null };
  try {
    const row = await findGithubSecret();
    return {
      success: true,
      message: 'OK',
      data: {
        configured: Boolean(row?.access_token.trim()),
        login: row?.account_login ?? '',
        verifiedAt: row?.verified_at ?? null,
      },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to load the GitHub connection.'), data: null };
  }
};

// Saves a token after proving it works — a token that can't authenticate is
// refused rather than stored, so "configured" always means "worked when saved".
// An empty token disconnects.
export const saveGithubToken = async (token: string): Promise<ApiSingleResponse<GithubStatus>> => {
  if (!isAdmin(await getCurrentRole())) return { success: false, message: ADMIN_REQUIRED, data: null };

  const value = token.trim();
  try {
    if (!value) {
      await upsertGithubSecret({ access_token: '', account_login: '', verified_at: null });
      return {
        success: true,
        message: 'GitHub disconnected.',
        data: { configured: false, login: '', verifiedAt: null },
      };
    }

    const user = await fetchGithubUser(value);
    if (!user.ok || !user.data) {
      return { success: false, message: githubErrorMessage(user.status, user.error), data: null };
    }
    const row = await upsertGithubSecret({
      access_token: value,
      account_login: user.data.login,
      verified_at: new Date().toISOString(),
    });
    return {
      success: true,
      message: `Connected to GitHub as ${row.account_login}.`,
      data: { configured: true, login: row.account_login, verifiedAt: row.verified_at },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to save the GitHub token.'), data: null };
  }
};

// Re-verifies the stored token and reports how many repositories it can see —
// the quickest way to spot a token scoped to the wrong owner.
export const testGithubConnection = async (): Promise<ApiSingleResponse<GithubTestResult>> => {
  if (!isAdmin(await getCurrentRole())) return { success: false, message: ADMIN_REQUIRED, data: null };
  try {
    const token = await storedToken();
    if (!token) return { success: false, message: 'No GitHub token is set.', data: null };

    const user = await fetchGithubUser(token);
    if (!user.ok || !user.data) {
      return { success: false, message: githubErrorMessage(user.status, user.error), data: null };
    }
    const repos = await fetchRepos(token);
    if (!repos.ok || !repos.data) {
      return { success: false, message: githubErrorMessage(repos.status, repos.error), data: null };
    }
    await upsertGithubSecret({
      access_token: token,
      account_login: user.data.login,
      verified_at: new Date().toISOString(),
    });
    return {
      success: true,
      message: `Connected as ${user.data.login} — ${repos.data.length} repositories visible.`,
      data: { login: user.data.login, repoCount: repos.data.length },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'GitHub check failed.'), data: null };
  }
};

// Repositories for the picker, alphabetical, archived ones left out (nothing
// deploys from an archived repository). No token is a normal answer —
// `configured: false` — so the popover can fall back to typing one in.
export const listGithubRepos = async (): Promise<ApiSingleResponse<GithubRepoList>> => {
  if (!canEdit(await getCurrentRole())) return { success: false, message: EDITOR_REQUIRED, data: null };
  try {
    const token = await storedToken();
    if (!token) return { success: true, message: 'OK', data: { configured: false, repos: [] } };

    const res = await fetchRepos(token);
    if (!res.ok || !res.data) {
      return { success: false, message: githubErrorMessage(res.status, res.error), data: null };
    }
    const repos = res.data
      .filter((r) => !r.archived)
      .map((r) => ({
        fullName: r.full_name,
        url: r.html_url,
        private: r.private,
        defaultBranch: r.default_branch,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    return { success: true, message: 'OK', data: { configured: true, repos } };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to list GitHub repositories.'), data: null };
  }
};

export const listGithubBranches = async (
  fullName: string
): Promise<ApiSingleResponse<GithubBranchList>> => {
  if (!canEdit(await getCurrentRole())) return { success: false, message: EDITOR_REQUIRED, data: null };

  const [owner, repo, ...rest] = fullName.split('/');
  if (!owner || !repo || rest.length || !REPO_SEGMENT.test(owner) || !REPO_SEGMENT.test(repo)) {
    return { success: false, message: 'Pass a repository as owner/name.', data: null };
  }

  try {
    const token = await storedToken();
    if (!token) return { success: true, message: 'OK', data: { configured: false, branches: [] } };

    const res = await fetchBranches(token, owner, repo);
    if (!res.ok || !res.data) {
      return { success: false, message: githubErrorMessage(res.status, res.error), data: null };
    }
    const branches = res.data.map((b) => b.name).sort((a, b) => a.localeCompare(b));
    return { success: true, message: 'OK', data: { configured: true, branches } };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to list branches.'), data: null };
  }
};
