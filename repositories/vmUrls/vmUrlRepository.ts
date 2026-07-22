import { createClient } from '@/lib/supabase/server';
import type { VmUrlRow } from '@/types/supabase/response/vmUrls';

// Repository layer: pure Supabase data access for the `vm_urls` table.

export type VmUrlWriteColumns = Partial<{
  vm_id: string;
  port: string;
  proto: string;
  url: string;
  dns: boolean;
  tested: boolean;
  notes: string;
  position: number;
}>;

export const findUrlsByVmIds = async (vmIds: string[]): Promise<VmUrlRow[]> => {
  if (vmIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vm_urls')
    .select('*')
    .in('vm_id', vmIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VmUrlRow[];
};

export const insertUrl = async (values: VmUrlWriteColumns): Promise<VmUrlRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vm_urls').insert(values).select('*').single();
  if (error) throw new Error(error.message);
  return data as VmUrlRow;
};

export const updateUrl = async (id: string, values: VmUrlWriteColumns): Promise<VmUrlRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vm_urls')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as VmUrlRow;
};

export const deleteUrl = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('vm_urls').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const countUrlsForVm = async (vmId: string): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('vm_urls')
    .select('id', { count: 'exact', head: true })
    .eq('vm_id', vmId);
  if (error) throw new Error(error.message);
  return count ?? 0;
};
