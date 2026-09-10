import { createClient } from '@/lib/supabase/server';
import type { ProjectRow } from '@/types/supabase/response/projects';
import type { EnvironmentRow } from '@/types/supabase/response/environments';

// Repository layer: pure Supabase data access for `projects` (and reads of a
// project's environments). No business rules — raw rows to the service layer.

export type ProjectWriteColumns = Partial<{
  name: string;
  slug: string;
  description: string;
  archived: boolean;
  archived_at: string | null;
  created_by: string | null;
}>;

export const findAllProjects = async (): Promise<ProjectRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    // The environments come back as rows, not as a `count` aggregate: the list
    // card's hover breakdown names each environment and the VM behind it, and one
    // row per environment carries both that and the tally
    // (`environments.length`).
    .select(
      '*, environments(id, name, vm_id, vms(name, old_ip, new_ip, migrated)), project_tags(tags(name))'
    )
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectRow[];
};

export const findProjectById = async (id: string): Promise<ProjectRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*, project_tags(tags(name))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProjectRow | null) ?? null;
};

export const findProjectEnvironments = async (projectId: string): Promise<EnvironmentRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('environments')
    .select('*, endpoints(*), vms(name, old_ip, new_ip, migrated)')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvironmentRow[];
};

export const insertProject = async (values: ProjectWriteColumns): Promise<ProjectRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').insert(values).select('*').single();
  if (error) throw new Error(error.message);
  return data as ProjectRow;
};

export const updateProject = async (
  id: string,
  values: ProjectWriteColumns
): Promise<ProjectRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .update(values)
    .eq('id', id)
    .select('*, project_tags(tags(name))')
    .single();
  if (error) throw new Error(error.message);
  return data as ProjectRow;
};

export const deleteProject = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
