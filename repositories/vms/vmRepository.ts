import { createClient } from '@/lib/supabase/server';
import type { VmRow } from '@/types/supabase/response/vms';
import type { MigratedArchiveEntry } from '@/types/common/vm';

// Repository layer: pure Supabase data access for the `vms` table. No business
// rules — just queries returning raw rows to the service layer.

// Columns a create/update may write (DB snake_case). Kept narrow so callers
// can never touch id/timestamps by accident.
export type VmWriteColumns = Partial<{
  name: string;
  old_ip: string;
  new_ip: string;
  migrated: boolean;
  is_supabase: boolean;
  keep: boolean;
  is_client: boolean;
  expanded: boolean;
  notes: string;
  migrated_archive: MigratedArchiveEntry[];
  deleted: boolean;
  deleted_at: string | null;
}>;

export const findAllVms = async (): Promise<VmRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vms')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VmRow[];
};

export const findVmById = async (id: string): Promise<VmRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vms').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VmRow | null) ?? null;
};

export const insertVm = async (values: VmWriteColumns): Promise<VmRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vms').insert(values).select('*').single();
  if (error) throw new Error(error.message);
  return data as VmRow;
};

export const updateVm = async (id: string, values: VmWriteColumns): Promise<VmRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vms')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as VmRow;
};

export const deleteVm = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('vms').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
