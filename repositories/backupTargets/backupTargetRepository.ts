import { createClient } from '@/lib/supabase/server';
import type { BackupDispatchRow, BackupTargetRow } from '@/types/supabase/response/backupTargets';

// Repository layer: pure Supabase data access for `backup_targets` and the
// `backup_dispatches` audit. The credentials are in
// `backupTargetSecretRepository` (service-role only); everything *about* the
// backups is fetched from the worker (`backupApiRepository`).

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

export const insertBackupDispatch = async (values: {
  target_id: string;
  source: string;
  status: string;
  http_status: number;
  error: string;
  requested_by: string | null;
}): Promise<void> => {
  const supabase = await createClient();
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
