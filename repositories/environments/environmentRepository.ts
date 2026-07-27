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
