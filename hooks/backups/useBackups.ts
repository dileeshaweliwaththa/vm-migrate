import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BackupLogPage,
  BackupTarget,
  BackupTargetInput,
  BackupTargetOverview,
} from '@/types/common/backup';

// Hook layer: the Backups tab. Bridges the UI to the API routes via TanStack
// Query — components call these, never the services.

export const BACKUPS_QUERY_KEY = ['backup-targets'] as const;
export const backupLogsQueryKey = (id: string) => ['backup-logs', id] as const;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(json.error || 'Request failed.');
  return json.data as T;
}

// Every target with its state and history.
//
// Each entry involves outbound calls to another host, so this is not on a
// refetch-on-focus hair trigger; the page refreshes it after an action and on a
// slow interval, which is enough for a schedule that runs nightly.
export const useBackupTargets = () =>
  useQuery({
    queryKey: BACKUPS_QUERY_KEY,
    queryFn: () => apiFetch<BackupTargetOverview[]>('/api/backups'),
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
  });

// A running backup's log tail. Polled quickly while something is running and not
// at all otherwise — `enabled` is what the card flips when it starts a run or
// sees `isBackupRunning` from the service.
export const useBackupLogs = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: backupLogsQueryKey(id),
    queryFn: () => apiFetch<BackupLogPage>(`/api/backups/${id}/logs?since=0`),
    enabled,
    refetchInterval: enabled ? 2_000 : false,
    refetchOnWindowFocus: false,
  });

// Every mutation invalidates the registry query, because all of them change
// something the cards display — a new target, a new dump, a schedule, a deleted
// file.
const useInvalidating = <TArgs, TData>(fn: (args: TArgs) => Promise<TData>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY }),
  });
};

export const useCreateBackupTarget = () =>
  useInvalidating((input: BackupTargetInput) =>
    apiFetch<BackupTarget>('/api/backups', { method: 'POST', body: JSON.stringify(input) })
  );

export const useUpdateBackupTarget = () =>
  useInvalidating(({ id, input }: { id: string; input: BackupTargetInput }) =>
    apiFetch<BackupTarget>(`/api/backups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  );

export const useDeleteBackupTarget = () =>
  useInvalidating((id: string) =>
    apiFetch<{ id: string }>(`/api/backups/${id}`, { method: 'DELETE' })
  );

export const useRunBackup = () =>
  useInvalidating(({ id, databases }: { id: string; databases: string[] }) =>
    apiFetch<{ ok: boolean; message: string }>(`/api/backups/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ databases }),
    })
  );

export const useSetWorkerCron = () =>
  useInvalidating(({ id, enabled }: { id: string; enabled: boolean }) =>
    apiFetch<{ ok: boolean; message: string; cronEnabled: boolean }>(
      `/api/backups/${id}/cron`,
      { method: 'POST', body: JSON.stringify({ enabled }) }
    )
  );

export const useReuploadBackup = () =>
  useInvalidating(({ id, recordId }: { id: string; recordId: string }) =>
    apiFetch<{ ok: boolean; message: string }>(`/api/backups/${id}/records/${recordId}`, {
      method: 'POST',
    })
  );

export const useDeleteBackupRecord = () =>
  useInvalidating(({ id, recordId }: { id: string; recordId: string }) =>
    apiFetch<{ ok: boolean; message: string }>(`/api/backups/${id}/records/${recordId}`, {
      method: 'DELETE',
    })
  );
