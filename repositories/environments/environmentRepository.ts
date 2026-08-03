import { createClient } from '@/lib/supabase/server';
import type { EnvironmentRow } from '@/types/supabase/response/environments';

// Repository layer: pure Supabase data access for `environments`.

export type EnvironmentWriteColumns = Partial<{
  project_id: string;
  name: string;
  cicd_provider: string;
  jenkins_url: string;
  jenkins_username: string;
  deploy_url: string;
  vm_id: string | null;
  notes: string;
  position: number;
}>;

// Every environment in the workspace, with its ports, in one query — what the
// dashboard summary aggregates over. Deliberately not per-project
// (`findProjectEnvironments`): the dashboard counts across all of them, and
// looping that call would be one round trip per project.
export const findAllEnvironments = async (): Promise<EnvironmentRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('environments')
    .select('*, environment_ports(*), vms(name)')
    .order('project_id', { ascending: true })
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvironmentRow[];
};

export const insertEnvironment = async (
  values: EnvironmentWriteColumns
): Promise<EnvironmentRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('environments')
    .insert(values)
    .select('*, environment_ports(*), vms(name)')
    .single();
  if (error) throw new Error(error.message);
  return data as EnvironmentRow;
};

export const updateEnvironment = async (
  id: string,
  values: EnvironmentWriteColumns
): Promise<EnvironmentRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('environments')
    .update(values)
    .eq('id', id)
    .select('*, environment_ports(*), vms(name)')
    .single();
  if (error) throw new Error(error.message);
  return data as EnvironmentRow;
};

export const deleteEnvironment = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('environments').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
