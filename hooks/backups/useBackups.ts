import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BackupLogPage,
  BackupScheduleTest,
  BackupTarget,
  BackupTargetInput,
  BackupTargetOverview,
} from '@/types/common/backup';

// Hook layer: the Backups tab. Bridges the UI to the API routes via TanStack
// Query — components call these, never the services.

export const BACKUPS_QUERY_KEY = ['backup-targets'] as const;
export const backupLogsQueryKey = (id: string) => ['backup-logs', id] as const;
export const backupTargetQueryKey = (id: string) => ['backup-target', id] as const;

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

// One target, for its own page. A separate key from the list so the detail page
// refreshes (and polls, while a run is in flight) without re-reading every other
// worker on every tick.
export const useBackupTarget = (id: string) =>
  useQuery({
    queryKey: backupTargetQueryKey(id),
    queryFn: () => apiFetch<BackupTargetOverview>(`/api/backups/${id}`),
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
  });

// A run's progress. The runner writes each step to `backup_run_events`, so this
// is a plain poll of our own database — no stream to proxy, and the lines are
// there for a page opened afterwards or by someone else.
//
// Always enabled: the most recent batch's lines are worth showing when nothing
// is running too ("last night's run did this"). It polls fast only while a run
// is in flight.
export const useBackupLogs = (id: string, running: boolean) =>
  useQuery({
    queryKey: backupLogsQueryKey(id),
    queryFn: () => apiFetch<BackupLogPage>(`/api/backups/${id}/logs?since=0`),
    refetchInterval: running ? 3_000 : false,
    refetchOnWindowFocus: false,
  });

// Every mutation invalidates the registry query, because all of them change
// something the cards display — a new target, a new dump, a schedule, a deleted
// file.
const useInvalidating = <TArgs, TData>(fn: (args: TArgs) => Promise<TData>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY });
      // The detail page reads its own key, so both have to be dropped — a run
      // started from a target's page has to refresh that page, not just the
      // index behind it.
      queryClient.invalidateQueries({ queryKey: ['backup-target'] });
    },
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

// Not invalidating: the test changes nothing, it only reports. It is slow on
// purpose (pg_net answers asynchronously, so the service waits for the
// response), hence a mutation rather than a query — it runs when asked.
export const useTestBackupSchedule = () =>
  useMutation({
    mutationFn: (id: string) =>
      apiFetch<BackupScheduleTest>(`/api/backups/${id}/schedule/test`, { method: 'POST' }),
  });

export const useDeleteBackupRecord = () =>
  useInvalidating(({ id, recordId }: { id: string; recordId: string }) =>
    apiFetch<{ ok: boolean; message: string }>(`/api/backups/${id}/records/${recordId}`, {
      method: 'DELETE',
    })
  );
