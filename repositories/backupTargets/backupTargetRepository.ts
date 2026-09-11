import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { BackupDispatchRow, BackupTargetRow } from '@/types/supabase/response/backupTargets';

// Repository layer: pure Supabase data access for `backup_targets` and the
// `backup_dispatches` audit. The credentials are in
// `backupTargetSecretRepository` (service-role only); the runs and their events
// are in `backupRuns/backupRunRepository`.
//
// Reads and writes of a target use the request-scoped client, so RLS applies and
// the admin-only write policy holds. The one exception is the dispatch insert
// below.

export type BackupTargetWriteColumns = Partial<{
  name: string;
  db_host: string;
  db_port: number;
  db_user: string;
  storage_id: string | null;
  blob_prefix: string;
  retention_days: number;
  cron_schedule: string;
  schedule_enabled: boolean;
  notes: string;
  position: number;
}>;

// The destination comes along so a card can name it without a second query.
const SELECT = '*, backup_storage_accounts(name, account_name, container)';

export const findAllBackupTargets = async (): Promise<BackupTargetRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_targets')
    .select(SELECT)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BackupTargetRow[];
};

export const findBackupTargetById = async (id: string): Promise<BackupTargetRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_targets')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BackupTargetRow | null) ?? null;
};

export const countBackupTargets = async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('backup_targets')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
};

export const insertBackupTarget = async (
  values: BackupTargetWriteColumns
): Promise<BackupTargetRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_targets')
    .insert(values)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as BackupTargetRow;
};

export const updateBackupTarget = async (
  id: string,
  values: BackupTargetWriteColumns
): Promise<BackupTargetRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_targets')
    .update(values)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as BackupTargetRow;
};

export const deleteBackupTarget = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('backup_targets').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ---- dispatch audit --------------------------------------------------------

// Records that a run was asked for.
//
// **Service-role**, because a scheduled run has no session to satisfy a policy
// with — pg_cron is not a person, and `backup_dispatches` has no insert policy
// for exactly that reason. The gate is in `runBackup`: `requireAdmin` for a
// manual run, and the cron route's own bearer token for a scheduled one.
//
// Writing it with the request client is what the first version did, which would
// have failed every scheduled run the moment one actually arrived — the row a
// silent schedule is diagnosed by is the row it could not write.
export const insertBackupDispatch = async (values: {
  target_id: string;
  source: string;
  status: string;
  http_status: number;
  error: string;
  requested_by: string | null;
}): Promise<void> => {
  const supabase = createServiceClient();
  const { error } = await supabase.from('backup_dispatches').insert(values);
  if (error) throw new Error(error.message);
};

// The most recent dispatch per target, for the cards. One query for the page:
// ordered newest-first and de-duplicated in the service, which beats a
// correlated subquery per target.
export const findRecentBackupDispatches = async (limit = 200): Promise<BackupDispatchRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_dispatches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as BackupDispatchRow[];
};
