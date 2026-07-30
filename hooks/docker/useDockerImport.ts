'use client';

import { useMutation } from '@tanstack/react-query';
import type { DockerParseResult } from '@/types/common/docker';

// Hook layer: previewing a pasted `docker ps` output for one environment.
//
// A mutation rather than a query — it's driven by the user submitting a paste, has
// no cache identity worth keeping, and must not re-run on its own.
//
// Importing a chosen candidate goes through `addPort` in useEnvironments, so this
// hook is preview-only and there's a single write path for records.
export const useParseDockerPs = (projectId: string, envId: string) =>
  useMutation({
    mutationFn: async (output: string): Promise<DockerParseResult> => {
      const res = await fetch(
        `/api/projects/${projectId}/environments/${envId}/docker-parse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ output }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to parse the output.');
      return json.data as DockerParseResult;
    },
  });
