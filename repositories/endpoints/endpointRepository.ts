import { createClient } from '@/lib/supabase/server';
import type { EndpointRow } from '@/types/supabase/response/endpoints';

// Repository layer: pure Supabase data access for `endpoints` — the one URL
// table, read by both the tracker and the projects pages. Replaces the old
// `vmUrlRepository` and `environmentPortRepository`.

export type EndpointWriteColumns = Partial<{
  environment_id: string | null;
  vm_id: string | null;
  port: string;
  branch: string;
  protocol: string;
  description: string;
  domain: string;
  source: string;
  jenkins_job_url: string;
  dns: boolean;
  tested: boolean;
  notes: string;
  position: number;
}>;

// What the tracker needs on a project-owned row: which environment it belongs
// to, which VM that environment sits on, and the project's name for the label.
const ENVIRONMENT_EMBED = 'environments!inner(id, name, vm_id, project_id, projects(name, slug))';

export const findEndpointById = async (id: string): Promise<EndpointRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('endpoints').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EndpointRow | null) ?? null;
};

// Every endpoint that belongs to any of these VMs, from both directions:
// VM-owned rows (`vm_id`) and project records whose environment sits on the VM.
//
// Two queries rather than one because the two conditions live on different
// tables — an `or` across an embedded resource isn't expressible in PostgREST —
// and a client-side union of two indexed reads beats fetching every endpoint and
// filtering in JS.
export const findEndpointsForVms = async (vmIds: string[]): Promise<EndpointRow[]> => {
  if (vmIds.length === 0) return [];
  const supabase = await createClient();

  const owned = await supabase
    .from('endpoints')
    .select('*')
    .in('vm_id', vmIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (owned.error) throw new Error(owned.error.message);

  const viaEnvironment = await supabase
    .from('endpoints')
    .select(`*, ${ENVIRONMENT_EMBED}`)
    .in('environments.vm_id', vmIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (viaEnvironment.error) throw new Error(viaEnvironment.error.message);

  return [
    ...((owned.data ?? []) as EndpointRow[]),
    ...((viaEnvironment.data ?? []) as EndpointRow[]),
  ];
};

export const findEndpointsByEnvironmentIds = async (
  environmentIds: string[]
): Promise<EndpointRow[]> => {
  if (environmentIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('endpoints')
    .select('*')
    .in('environment_id', environmentIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EndpointRow[];
};

export const insertEndpoint = async (values: EndpointWriteColumns): Promise<EndpointRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('endpoints').insert(values).select('*').single();
  if (error) throw new Error(error.message);
  return data as EndpointRow;
};

export const updateEndpoint = async (
  id: string,
  values: EndpointWriteColumns
): Promise<EndpointRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('endpoints')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EndpointRow;
};

export const deleteEndpoint = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('endpoints').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// Row counts, used to position a newly added row at the end of its list.
export const countEndpointsForVm = async (vmId: string): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('endpoints')
    .select('id', { count: 'exact', head: true })
    .eq('vm_id', vmId);
  if (error) throw new Error(error.message);
  return count ?? 0;
};

export const countEndpointsForEnvironment = async (environmentId: string): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('endpoints')
    .select('id', { count: 'exact', head: true })
    .eq('environment_id', environmentId);
  if (error) throw new Error(error.message);
  return count ?? 0;
};
