import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// Repository layer: `backup_storage_accounts` and its connection string.
//
// One Azure destination shared by every backup target, rather than the same
// account and key typed in per database server. The non-secret half uses the
// request-scoped client (RLS applies); the connection string uses the
// service-role client, because `backup_storage_secrets` has RLS on with no
// policies and is unreachable by any client.

export interface BackupStorageAccountRow {
  id: string;
  name: string;
  account_name: string;
  container: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type BackupStorageWriteColumns = Partial<{
  name: string;
  account_name: string;
  container: string;
  notes: string;
}>;

export const findAllStorageAccounts = async (): Promise<BackupStorageAccountRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_storage_accounts')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BackupStorageAccountRow[];
};

export const findStorageAccountById = async (
  id: string
): Promise<BackupStorageAccountRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_storage_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BackupStorageAccountRow | null) ?? null;
};

export const insertStorageAccount = async (
  values: BackupStorageWriteColumns
): Promise<BackupStorageAccountRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_storage_accounts')
    .insert(values)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as BackupStorageAccountRow;
};

export const updateStorageAccount = async (
  id: string,
  values: BackupStorageWriteColumns
): Promise<BackupStorageAccountRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_storage_accounts')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as BackupStorageAccountRow;
};

// The FK on `backup_targets` is `on delete set null`, so a target survives its
// destination being removed — with nowhere to write, which the page reports.
export const deleteStorageAccount = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('backup_storage_accounts').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ---- the connection string (service-role only) -----------------------------

export const getStorageConnectionString = async (id: string): Promise<string> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('backup_storage_secrets')
    .select('connection_string')
    .eq('storage_id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.connection_string as string | undefined) ?? '';
};

// Which accounts hold a connection string. **Flags only** — the one query here
// whose result informs a decision made elsewhere, so it deliberately cannot
// carry a credential out of this file.
export const findStorageIdsWithSecret = async (ids: string[]): Promise<string[]> => {
  if (ids.length === 0) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('backup_storage_secrets')
    .select('storage_id, connection_string')
    .in('storage_id', ids);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => ((row.connection_string as string | null) ?? '').trim().length > 0)
    .map((row) => row.storage_id as string);
};

// Blank is not written: the form is never sent the stored value, so an empty
// field means "keep it" rather than "clear it".
export const setStorageConnectionString = async (
  id: string,
  connectionString: string
): Promise<void> => {
  if (!connectionString.trim()) return;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('backup_storage_secrets')
    .upsert({ storage_id: id, connection_string: connectionString }, { onConflict: 'storage_id' });
  if (error) throw new Error(error.message);
};
