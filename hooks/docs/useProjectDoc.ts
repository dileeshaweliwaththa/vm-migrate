'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProjectDoc, ProjectDocInput } from '@/types/common/doc';

// Hook layer: bridges the documentation UI to /api/projects/:id/docs.

const docKey = (projectId: string) => ['project-doc', projectId];

export const useProjectDoc = (projectId: string) =>
  useQuery({
    queryKey: docKey(projectId),
    queryFn: async (): Promise<ProjectDoc | null> => {
      const res = await fetch(`/api/projects/${projectId}/docs`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load documentation.');
      return json.data as ProjectDoc | null;
    },
  });

export const useSaveProjectDoc = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectDocInput): Promise<ProjectDoc> => {
      const res = await fetch(`/api/projects/${projectId}/docs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save documentation.');
      return json.data as ProjectDoc;
    },
    onSuccess: (data) => qc.setQueryData(docKey(projectId), data),
  });
};
