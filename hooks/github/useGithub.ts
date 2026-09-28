'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GithubBranchList,
  GithubRepoList,
  GithubStatus,
  GithubTestResult,
} from '@/types/common/github';

// Hook layer: the GitHub connection — its Settings section (admin) and the
// repository/branch pickers on a record (editor+). The token itself is never
// fetched; only whether one is set.

const STATUS_KEY = ['github-status'];
const REPOS_KEY = ['github-repos'];
const branchesKey = (fullName: string) => ['github-branches', fullName];

// Repositories and branches change rarely compared with how often a popover is
// opened, and each listing is up to ten GitHub requests.
const LISTING_STALE_MS = 5 * 60 * 1_000;

const readJson = async <T>(res: Response, fallback: string): Promise<T> => {
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? fallback);
  return json.data as T;
};

export const useGithubStatus = () =>
  useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () =>
      readJson<GithubStatus>(await fetch('/api/settings/github'), 'Failed to load the GitHub connection.'),
  });

// Save or (with an empty token) disconnect. A new token means a new set of
// visible repositories, so the picker's listings are dropped too.
export const useSaveGithubToken = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string): Promise<GithubStatus> =>
      readJson<GithubStatus>(
        await fetch('/api/settings/github', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }),
        'Failed to save the GitHub token.'
      ),
    onSuccess: (data) => {
      qc.setQueryData(STATUS_KEY, data);
      qc.removeQueries({ queryKey: REPOS_KEY });
      qc.removeQueries({ queryKey: ['github-branches'] });
    },
  });
};

export const useTestGithub = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<GithubTestResult> =>
      readJson<GithubTestResult>(
        await fetch('/api/settings/github/test', { method: 'POST' }),
        'GitHub check failed.'
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  });
};

// Only fetched while `enabled` — the record's source popover is open.
export const useGithubRepos = (enabled: boolean) =>
  useQuery({
    queryKey: REPOS_KEY,
    enabled,
    retry: false,
    staleTime: LISTING_STALE_MS,
    queryFn: async () =>
      readJson<GithubRepoList>(await fetch('/api/github/repos'), 'Failed to list GitHub repositories.'),
  });

// `fullName` is `owner/name`; null (a non-GitHub or unset repository) disables it.
export const useGithubBranches = (fullName: string | null, enabled: boolean) =>
  useQuery({
    queryKey: branchesKey(fullName ?? ''),
    enabled: enabled && Boolean(fullName),
    retry: false,
    staleTime: LISTING_STALE_MS,
    queryFn: async () =>
      readJson<GithubBranchList>(
        await fetch(`/api/github/branches?repo=${encodeURIComponent(fullName ?? '')}`),
        'Failed to list branches.'
      ),
  });
