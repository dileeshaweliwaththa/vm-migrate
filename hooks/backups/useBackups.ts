import { useCallback } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BackupLogPage,
  BackupScheduleTest,
  BackupTarget,
  BackupTargetInput,
  BackupTargetLive,
  BackupTargetOverview,
  BackupTargetSummary,
} from '@/types/common/backup';

// Hook layer: the Backups tab. Bridges the UI to the API routes via TanStack
// Query — components call these, never the services.
//
// **Two tiers, two query keys, two cache policies**, which is the whole reason
// these pages are quick now. One query used to carry everything, so nothing
// rendered until a MySQL connection to another host and a listing of an Azure
// container had both answered — several seconds of skeleton for text that was
// sitting in Postgres.
//
//   `backup-targets` / `backup-target` — Supabase only. Cheap, so they may be
//     refetched on a timer and kept fresh.
//   `backup-live`                      — one target's outbound checks. Slow, so
//     it is cached for minutes, never polled, and never refetched on a window
//     focus. The index and the target page share the key, so walking into a
//     target shows what its card already knew.

export const BACKUPS_QUERY_KEY = ['backup-targets'] as const;
export const backupLogsQueryKey = (id: string) => ['backup-logs', id] as const;
export const backupTargetQueryKey = (id: string) => ['backup-target', id] as const;
// A prefix, so a mutation can drop every target's live check at once.
export const BACKUP_LIVE_QUERY_KEY = ['backup-live'] as const;
export const backupLiveQueryKey = (id: string) => [...BACKUP_LIVE_QUERY_KEY, id] as const;

// A live check is worth this long: the database list changes when someone adds a
// database, and the container gains blobs when a run finishes — neither is a
// thing to re-ask about while you read the page you just opened.
const LIVE_STALE_MS = 5 * 60_000;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(json.error || 'Request failed.');
  return json.data as T;
}

// Every target, as the index cards draw them. Supabase only — a handful of
// indexed queries — so it can be kept properly fresh: a run started in another
// browser shows up here within the interval.
export const useBackupTargets = () =>
  useQuery({
    queryKey: BACKUPS_QUERY_KEY,
    queryFn: () => apiFetch<BackupTargetSummary[]>('/api/backups'),
    refetchInterval: 30_000,
  });

// One target, for its own page: the same facts plus the runs this app performed.
// A separate key from the list so the detail page refreshes without re-reading
// every other target on every tick.
export const useBackupTarget = (id: string) =>
  useQuery({
    queryKey: backupTargetQueryKey(id),
    queryFn: () => apiFetch<BackupTargetOverview>(`/api/backups/${id}`),
    refetchInterval: 30_000,
  });

// One target's outbound checks — is the server reachable, what is on it, and
// what older dumps are in the container.
//
// The expensive query, and treated as one: cached for minutes, never polled, and
// left alone on a window focus. A failure here is a card that cannot say
// "Ready", not a broken page, so it is not retried into a long wait either.
export const useBackupTargetLive = (id: string) =>
  useQuery({
    queryKey: backupLiveQueryKey(id),
    queryFn: () => apiFetch<BackupTargetLive>(`/api/backups/${id}/live`),
    staleTime: LIVE_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });

// The same check for every card on the index, one query each so a slow host
// delays only its own card.
//
// `useQueries` rather than a hook per card: the header's counts need all of
// them, and a component that renders a variable-length list cannot call a hook
// per item. The keys are `useBackupTargetLive`'s, so opening a target reuses
// what its card already fetched.
export const useBackupTargetsLive = (ids: string[]) =>
  useQueries({
    queries: ids.map((id) => ({
      queryKey: backupLiveQueryKey(id),
      queryFn: () => apiFetch<BackupTargetLive>(`/api/backups/${id}/live`),
      staleTime: LIVE_STALE_MS,
      refetchOnWindowFocus: false,
      retry: false,
    })),
    combine: (results) => ({
      byTarget: new Map(ids.map((id, i) => [id, results[i]?.data])),
      // Which are still being checked, so a card can say so rather than showing
      // a confident "Unreachable" it has not established yet.
      pending: new Set(ids.filter((_, i) => results[i]?.isPending)),
      // A check that could not be made at all — the route failed, rather than
      // the database refusing a connection. Distinct from `unreachable`, and
      // distinct again from not having asked: all three read differently on a
      // page whose job is to say whether backups are happening.
      errors: new Map(ids.map((id, i) => [id, results[i]?.error ?? null])),
      unreachable: results.filter((result) => result.data && !result.data.status.reachable).length,
    }),
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

// Every mutation invalidates the two cheap keys, because all of them change
// something the cards display — a new target, a new dump, a schedule, a deleted
// file.
//
// **The live key is dropped only when asked**, since refetching it costs a MySQL
// connection and a container listing per target. Editing a target's credentials
// or host changes whether it is reachable, and deleting a dump changes what is in
// the container, so those pass `live`. Starting a run does not: it returns the
// moment the first dump begins, minutes before any blob exists, and the page
// follows it through the log instead.
const useInvalidating = <TArgs, TData>(
  fn: (args: TArgs) => Promise<TData>,
  { live = false }: { live?: boolean } = {}
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY });
      // The detail page reads its own key, so both have to be dropped — a run
      // started from a target's page has to refresh that page, not just the
      // index behind it.
      queryClient.invalidateQueries({ queryKey: ['backup-target'] });
      if (live) queryClient.invalidateQueries({ queryKey: BACKUP_LIVE_QUERY_KEY });
    },
  });
};

// Re-checks one target against the outside world. The target page calls it when
// a run it was following finishes: that is the moment new blobs exist, and the
// moment the history is worth listing the container for again.
export const useRefreshBackupLive = () => {
  const queryClient = useQueryClient();
  // Stable, so a caller can list it as an effect dependency without the effect
  // re-running on every render.
  return useCallback(
    (id: string) => {
      void queryClient.invalidateQueries({ queryKey: backupLiveQueryKey(id) });
    },
    [queryClient]
  );
};

export const useCreateBackupTarget = () =>
  useInvalidating(
    (input: BackupTargetInput) =>
      apiFetch<BackupTarget>('/api/backups', { method: 'POST', body: JSON.stringify(input) }),
    // A target nobody has checked yet: its card would otherwise sit on "Checking"
    // until something else dropped the key.
    { live: true }
  );

export const useUpdateBackupTarget = () =>
  useInvalidating(
    ({ id, input }: { id: string; input: BackupTargetInput }) =>
      apiFetch<BackupTarget>(`/api/backups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    // The host, the credentials and the destination all live in this form, and
    // all three decide whether the target can be reached.
    { live: true }
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
  useInvalidating(
    ({ id, recordId }: { id: string; recordId: string }) =>
      apiFetch<{ ok: boolean; message: string }>(`/api/backups/${id}/records/${recordId}`, {
        method: 'DELETE',
      }),
    // The blob is gone; a history still listing it is wrong rather than stale.
    { live: true }
  );
