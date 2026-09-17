import { createClient } from '@/lib/supabase/server';
import type { VmIpRow } from '@/types/supabase/response/vmIps';
import type { VmIpOrigin } from '@/types/common/vm';

// Repository layer: pure Supabase data access for `vm_ips` — the additional
// public addresses a VM answers on, beyond its own `vms.new_ip`. No business
// rules; the service owns those.

export type VmIpWriteColumns = Partial<{
  vm_id: string;
  address: string;
  label: string;
  origin: VmIpOrigin;
  source_vm_id: string | null;
  source_vm_name: string;
  moved_at: string | null;
  position: number;
  notes: string;
}>;

// Every extra address for a set of VMs, in one query — the tracker loads the
// whole grid at once, so this is never called per row.
export const findVmIpsForVms = async (vmIds: string[]): Promise<VmIpRow[]> => {
  if (vmIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vm_ips')
    .select('*')
    .in('vm_id', vmIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VmIpRow[];
};

// The addresses that were taken **off** a given VM. One row here is the explicit
// link the tracker used to have to guess at by comparing IP strings.
export const findVmIpsBySourceVm = async (sourceVmId: string): Promise<VmIpRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vm_ips').select('*').eq('source_vm_id', sourceVmId);
  if (error) throw new Error(error.message);
  return (data ?? []) as VmIpRow[];
};

export const insertVmIp = async (values: VmIpWriteColumns): Promise<VmIpRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vm_ips').insert(values).select('*').single();
  if (error) throw new Error(error.message);
  return data as VmIpRow;
};

export const updateVmIp = async (id: string, values: VmIpWriteColumns): Promise<VmIpRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vm_ips')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as VmIpRow;
};

// The endpoints on this address fall back to the VM's primary — `endpoints.ip_id`
// is `on delete set null`, so removing an address never removes a URL.
export const deleteVmIp = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('vm_ips').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// Row count, used to position a newly added address at the end of its VM's list.
export const countVmIpsForVm = async (vmId: string): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('vm_ips')
    .select('id', { count: 'exact', head: true })
    .eq('vm_id', vmId);
  if (error) throw new Error(error.message);
  return count ?? 0;
};
