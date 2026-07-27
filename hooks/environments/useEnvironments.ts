'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectDetailKey } from '@/hooks/projects/useProjects';
import type {
  Environment,
  EnvironmentInput,
  EnvironmentPort,
  EnvironmentPortInput,
} from '@/types/common/project';

// Hook layer for environments + ports. All mutations invalidate the parent
// project-detail query so the page re-renders with fresh data.

const json = async (res: Response, fallback: string) => {
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body.data;
};

export const useEnvironmentMutations = (projectId: string) => {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: projectDetailKey(projectId) });
  const base = `/api/projects/${projectId}/environments`;

  const addEnvironment = useMutation({
    mutationFn: async (input: EnvironmentInput): Promise<Environment> =>
      json(
        await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
        'Failed to add environment.'
      ),
    onSuccess: invalidate,
  });

  const updateEnvironment = useMutation({
    mutationFn: async ({ envId, input }: { envId: string; input: EnvironmentInput }): Promise<Environment> =>
      json(
        await fetch(`${base}/${envId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
        'Failed to update environment.'
      ),
    onSuccess: invalidate,
  });

  const removeEnvironment = useMutation({
    mutationFn: async (envId: string): Promise<{ id: string }> =>
      json(await fetch(`${base}/${envId}`, { method: 'DELETE' }), 'Failed to remove environment.'),
    onSuccess: invalidate,
  });

  const addPort = useMutation({
    mutationFn: async ({ envId, input }: { envId: string; input: EnvironmentPortInput }): Promise<EnvironmentPort> =>
      json(
        await fetch(`${base}/${envId}/ports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
        'Failed to add port.'
      ),
    onSuccess: invalidate,
  });

  const updatePort = useMutation({
    mutationFn: async ({ envId, portId, input }: { envId: string; portId: string; input: EnvironmentPortInput }): Promise<EnvironmentPort> =>
      json(
        await fetch(`${base}/${envId}/ports/${portId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
        'Failed to update port.'
      ),
    onSuccess: invalidate,
  });

  const removePort = useMutation({
    mutationFn: async ({ envId, portId }: { envId: string; portId: string }): Promise<{ id: string }> =>
      json(await fetch(`${base}/${envId}/ports/${portId}`, { method: 'DELETE' }), 'Failed to delete port.'),
    onSuccess: invalidate,
  });

  // Pull this environment's Jenkins job config and refresh its jenkins-sourced
  // ports (global credentials, per-environment target). Returns a result message.
  const syncFromJenkins = useMutation({
    mutationFn: async (envId: string): Promise<{ written: number; message: string }> => {
      const res = await fetch(`${base}/${envId}/jenkins-sync`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Jenkins sync failed.');
      return { written: body.data?.written ?? 0, message: body.message ?? 'Synced.' };
    },
    onSuccess: invalidate,
  });

  return {
    addEnvironment,
    updateEnvironment,
    removeEnvironment,
    addPort,
    updatePort,
    removePort,
    syncFromJenkins,
  };
};
