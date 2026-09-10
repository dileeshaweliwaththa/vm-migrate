import { createServiceClient } from '@/lib/supabase/service';

// Repository layer: a VM's Jenkins API token in `vm_jenkins_secrets`.
//
// Same construction as `environmentSecretRepository`: the table has RLS enabled
// with NO policies, so no authenticated client can touch it. Only this
// repository — via the service-role client, from server code behind a role check
// in the service layer — ever reads or writes it. The token never reaches the
// browser, which is what lets a viewer trigger a build without seeing the
// credentials.

export const getVmJenkinsToken = async (vmId: string): Promise<string> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('vm_jenkins_secrets')
    .select('jenkins_api_token')
    .eq('vm_id', vmId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.jenkins_api_token as string | undefined) ?? '';
};

export const hasVmJenkinsToken = async (vmId: string): Promise<boolean> => {
  const token = await getVmJenkinsToken(vmId);
  return token.trim().length > 0;
};

// Which of these VMs hold a non-empty token. Returns **ids only** — like its
// per-environment counterpart, it deliberately cannot carry a token value out of
// this file.
export const findVmIdsWithJenkinsToken = async (vmIds: string[]): Promise<string[]> => {
  if (vmIds.length === 0) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('vm_jenkins_secrets')
    .select('vm_id, jenkins_api_token')
    .in('vm_id', vmIds);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => ((row.jenkins_api_token as string | null) ?? '').trim().length > 0)
    .map((row) => row.vm_id as string);
};

export const setVmJenkinsToken = async (vmId: string, token: string): Promise<void> => {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('vm_jenkins_secrets')
    .upsert({ vm_id: vmId, jenkins_api_token: token }, { onConflict: 'vm_id' });
  if (error) throw new Error(error.message);
};
