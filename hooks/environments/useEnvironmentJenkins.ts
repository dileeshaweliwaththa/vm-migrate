'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectDetailKey } from '@/hooks/projects/useProjects';
import type {
  EnvironmentJenkinsConfig,
  EnvironmentJenkinsInput,
  JenkinsJobSummary,
} from '@/types/common/jenkins';

const base = (projectId: string, envId: string) =>
  `/api/projects/${projectId}/environments/${envId}`;

// Hook layer: per-environment Jenkins config (URL + username + hasToken). The
// token itself is never fetched — only whether one is set.

const configKey = (projectId: string, envId: string) => ['env-jenkins', projectId, envId];

export const useEnvironmentJenkinsConfig = (projectId: string, envId: string, enabled: boolean) =>
  useQuery({
    queryKey: configKey(projectId, envId),
    enabled,
    queryFn: async (): Promise<EnvironmentJenkinsConfig> => {
      const res = await fetch(`/api/projects/${projectId}/environments/${envId}/jenkins-config`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load Jenkins config.');
      return json.data as EnvironmentJenkinsConfig;
    },
  });

export const useSaveEnvironmentJenkinsConfig = (projectId: string, envId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EnvironmentJenkinsInput): Promise<EnvironmentJenkinsConfig> => {
      const res = await fetch(`/api/projects/${projectId}/environments/${envId}/jenkins-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save Jenkins config.');
      return json.data as EnvironmentJenkinsConfig;
    },
    onSuccess: (data) => {
      qc.setQueryData(configKey(projectId, envId), data);
      qc.invalidateQueries({ queryKey: projectDetailKey(projectId) });
    },
  });
};

// Lists all jobs on the environment's Jenkins server. Enabled only while the
// browse dialog is open.
export const useJenkinsJobs = (projectId: string, envId: string, enabled: boolean) =>
  useQuery({
    queryKey: ['env-jenkins-jobs', projectId, envId],
    enabled,
    retry: false,
    queryFn: async (): Promise<JenkinsJobSummary[]> => {
      const res = await fetch(`${base(projectId, envId)}/jenkins-jobs`);
      // Read as text first so an unexpected non-JSON body (e.g. a proxy/error
      // page) surfaces a clean message instead of a raw JSON-parse error.
      const raw = await res.text();
      let json: { data?: JenkinsJobSummary[]; error?: string } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Unexpected server response (HTTP ${res.status}).`);
      }
      if (!res.ok) throw new Error(json.error ?? 'Failed to load Jenkins jobs.');
      return (json.data ?? []) as JenkinsJobSummary[];
    },
  });

// Triggers a build of a job (returns the server message).
export const useTriggerJenkinsBuild = (projectId: string, envId: string) =>
  useMutation({
    mutationFn: async (jobUrl: string): Promise<string> => {
      const res = await fetch(`${base(projectId, envId)}/jenkins-build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to trigger build.');
      return json.message ?? 'Build queued.';
    },
  });

// Links a chosen job to this environment (sets URL + copies description).
export const useLinkJenkinsJob = (projectId: string, envId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { jobUrl: string; description: string }): Promise<string> => {
      const res = await fetch(`${base(projectId, envId)}/jenkins-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to link the job.');
      return json.message ?? 'Job linked.';
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectDetailKey(projectId) });
      qc.invalidateQueries({ queryKey: configKey(projectId, envId) });
    },
  });
};
