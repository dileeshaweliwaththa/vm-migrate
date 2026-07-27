'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectDetailKey } from '@/hooks/projects/useProjects';
import type {
  EnvironmentJenkinsConfig,
  EnvironmentJenkinsInput,
} from '@/types/common/jenkins';

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
