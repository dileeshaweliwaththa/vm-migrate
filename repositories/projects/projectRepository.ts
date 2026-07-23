import { createClient } from '@/lib/supabase/server';
import type { ProjectRow } from '@/types/supabase/response/projects';
import type { EnvironmentRow } from '@/types/supabase/response/environments';

// Repository layer: pure Supabase data access for `projects` (and reads of a
// project's environments). No business rules — raw rows to the service layer.

export type ProjectWriteColumns = Partial<{
  name: string;
  slug: string;
  client: string;
  description: string;
  repo_url: string;
  cicd_provider: string;
  archived: boolean;
  archived_at: string | null;
  created_by: string | null;
}>;

export const findAllProjects = async (): Promise<ProjectRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*, environments(count)')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectRow[];
};

export const findProjectById = async (id: string): Promise<ProjectRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProjectRow | null) ?? null;
};

export const findProjectEnvironments = async (projectId: string): Promise<EnvironmentRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('environments')
    .select('*, environment_ports(*), vms(name)')
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
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ProjectRow;
};

export const deleteProject = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
