'use client';

import { useMutation } from '@tanstack/react-query';
import type { GeminiStatus } from '@/types/common/ai';

// Hook layer: on-demand Gemini health/quota check (Settings "Check status").
export const useGeminiStatus = () =>
  useMutation({
    mutationFn: async (): Promise<GeminiStatus> => {
      const res = await fetch('/api/ai/status');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Status check failed.');
      return json.data as GeminiStatus;
    },
  });
