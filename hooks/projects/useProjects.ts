'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TAGS_KEY } from '@/hooks/tags/useTags';
import type { Project, ProjectDetail, ProjectInput } from '@/types/common/project';

// Hook layer for projects. Components call these; never services/repos directly.

const LIST_KEY = ['projects'];
export const projectDetailKey = (id: string) => ['project', id];

const json = async (res: Response, fallback: string) => {
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body.data;
};

// `includeArchived` is a request, not a grant: the service re-checks the caller is
// an admin, so passing true as an editor simply returns the active list. The flag
// is part of the query key so toggling it refetches instead of reusing the other
// list; LIST_KEY stays the prefix, so existing invalidations still match both.
export const useProjects = (includeArchived = false) =>
  useQuery({
    queryKey: [...LIST_KEY, { archived: includeArchived }],
    queryFn: async (): Promise<Project[]> =>
      json(
        await fetch(`/api/projects${includeArchived ? '?archived=true' : ''}`),
        'Failed to load projects.'
      ),
  });

export const useProject = (id: string) =>
  useQuery({
    queryKey: projectDetailKey(id),
    enabled: Boolean(id),
    queryFn: async (): Promise<ProjectDetail> =>
      json(await fetch(`/api/projects/${id}`), 'Failed to load project.'),
  });

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectInput): Promise<Project> =>
      json(
        await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
        'Failed to create project.'
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: TAGS_KEY });
    },
  });
};

export const useUpdateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ProjectInput }): Promise<Project> =>
      json(
        await fetch(`/api/projects/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
        'Failed to update project.'
      ),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: projectDetailKey(id) });
      qc.invalidateQueries({ queryKey: TAGS_KEY });
    },
  });
};

export const useArchiveProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }): Promise<Project> =>
      json(
        await fetch(`/api/projects/${id}/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived }),
        }),
        'Failed to archive project.'
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
};

export const useDeleteProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ id: string }> =>
      json(await fetch(`/api/projects/${id}`, { method: 'DELETE' }), 'Failed to delete project.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
};
