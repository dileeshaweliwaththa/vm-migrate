'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, AppSettingsInput } from '@/types/common/settings';

// Hook layer: bridges the admin settings UI to /api/settings. Components call
// these — never the service/repository layers directly.

const SETTINGS_KEY = ['app-settings'];

export const useAppSettings = () =>
  useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<AppSettings> => {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load settings.');
      return json.data as AppSettings;
    },
  });

export const useSaveSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AppSettingsInput): Promise<AppSettings> => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save settings.');
      return json.data as AppSettings;
    },
    onSuccess: (data) => qc.setQueryData(SETTINGS_KEY, data),
  });
};
