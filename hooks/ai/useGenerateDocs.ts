'use client';

import { useMutation } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/core';

// Hook layer: bridges the "Generate by AI" button to /api/ai/generate-docs.
// Returns Tiptap JSON the editor loads; persistence happens separately via the
// docs save hook once the user is happy with the result.
export const useGenerateDocs = () =>
  useMutation({
    mutationFn: async (projectId: string): Promise<JSONContent> => {
      const res = await fetch('/api/ai/generate-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'AI generation failed.');
      return (json.data as { contentJson: JSONContent }).contentJson;
    },
  });
