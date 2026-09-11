import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BACKUPS_QUERY_KEY } from '@/hooks/backups/useBackups';
import type { BackupStorageAccount, BackupStorageInput } from '@/types/common/backup';

// Hook layer: the Azure destinations. Separate from `useBackups` because a
// storage account is its own entity with its own lifetime — it outlives the
// targets that point at it.

export const BACKUP_STORAGE_QUERY_KEY = ['backup-storage'] as const;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(json.error || 'Request failed.');
  return json.data as T;
}

export const useBackupStorageAccounts = () =>
  useQuery({
    queryKey: BACKUP_STORAGE_QUERY_KEY,
    queryFn: () => apiFetch<BackupStorageAccount[]>('/api/backups/storage'),
    refetchOnWindowFocus: false,
  });

// Every write invalidates the targets too: a target's card shows the
// destination's name, and whether it is usable at all depends on this account
// having a connection string.
const useInvalidating = <TArgs, TData>(fn: (args: TArgs) => Promise<TData>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BACKUP_STORAGE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['backup-target'] });
    },
  });
};

export const useCreateBackupStorage = () =>
  useInvalidating((input: BackupStorageInput) =>
    apiFetch<BackupStorageAccount>('/api/backups/storage', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );

export const useUpdateBackupStorage = () =>
  useInvalidating(({ id, input }: { id: string; input: BackupStorageInput }) =>
    apiFetch<BackupStorageAccount>(`/api/backups/storage/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  );

export const useDeleteBackupStorage = () =>
  useInvalidating((id: string) =>
    apiFetch<{ id: string }>(`/api/backups/storage/${id}`, { method: 'DELETE' })
  );

export const useTestBackupStorage = () =>
  useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean; message: string }>(`/api/backups/storage/${id}`, {
        method: 'POST',
      }),
  });
