import { createClient } from '@/lib/supabase/server';
import type { VmGroupRow } from '@/types/supabase/response/vmGroups';

// Repository layer: pure Supabase data access for the `vm_groups` table. No
// business rules — just queries returning raw rows to the service layer.

// Columns a create/update may write (DB snake_case). Narrow on purpose so a
// caller can never touch id/timestamps by accident.
export type VmGroupWriteColumns = Partial<{
  name: string;
  notes: string;
}>;

export const findAllVmGroups = async (): Promise<VmGroupRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vm_groups')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VmGroupRow[];
};

export const insertVmGroup = async (values: VmGroupWriteColumns): Promise<VmGroupRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vm_groups').insert(values).select('*').single();
  if (error) throw new Error(error.message);
  return data as VmGroupRow;
};

export const updateVmGroup = async (
  id: string,
  values: VmGroupWriteColumns
): Promise<VmGroupRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vm_groups')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as VmGroupRow;
};

// The FK is `on delete set null`, so this ungroups the group's VMs rather than
// deleting them — see the vm_groups migration.
export const deleteVmGroup = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('vm_groups').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
