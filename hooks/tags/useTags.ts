'use client';

import { useQuery } from '@tanstack/react-query';

export const TAGS_KEY = ['tags'];

// Existing tag names for the project tag picker.
export const useTags = () =>
  useQuery({
    queryKey: TAGS_KEY,
    queryFn: async (): Promise<string[]> => {
      const res = await fetch('/api/tags');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load tags.');
      return body.data as string[];
    },
  });
