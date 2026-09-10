import { createClient } from '@/lib/supabase/server';
import type { VmJenkinsRow } from '@/types/supabase/response/vmJenkins';

// Repository layer: the non-secret half of a VM's Jenkins setup (`vm_jenkins` —
// server URL + username). The token is in `vmJenkinsSecretRepository`, which is
// service-role only.

export type VmJenkinsWriteColumns = Partial<{
  base_url: string;
  username: string;
}>;

export const findVmJenkins = async (vmId: string): Promise<VmJenkinsRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vm_jenkins')
    .select('*')
    .eq('vm_id', vmId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VmJenkinsRow | null) ?? null;
};

// Every configured VM, for the tracker's "Jenkins is set up here" markers. One
// query for the whole grid rather than one per VM.
export const findAllVmJenkins = async (): Promise<VmJenkinsRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vm_jenkins').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as VmJenkinsRow[];
};

export const upsertVmJenkins = async (
  vmId: string,
  values: VmJenkinsWriteColumns
): Promise<VmJenkinsRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vm_jenkins')
    .upsert({ vm_id: vmId, ...values }, { onConflict: 'vm_id' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as VmJenkinsRow;
};
