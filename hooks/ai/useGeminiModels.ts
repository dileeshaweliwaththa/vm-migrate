'use client';

import { useQuery } from '@tanstack/react-query';

// Hook layer: the list of Gemini models the configured key supports. Fails soft
// — the settings UI falls back to a static list when this errors (e.g. no key
// saved yet). `refetch` lets the UI reload after a key is saved.
export const useGeminiModels = () =>
  useQuery({
    queryKey: ['gemini-models'],
    retry: false,
    queryFn: async (): Promise<string[]> => {
      const res = await fetch('/api/ai/models');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load models.');
      return json.data as string[];
    },
  });
