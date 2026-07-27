import { createClient } from '@/lib/supabase/server';
import type { JSONContent } from '@tiptap/core';
import type { ProjectDocRow } from '@/types/supabase/response/projectDocs';

// Repository layer: pure Supabase data access for `project_docs` (1-to-1 with a
// project). Raw rows to the service layer; no business rules.

export interface ProjectDocWriteColumns {
  content_json: JSONContent;
  content_html: string;
  generated_by_ai: boolean;
  updated_by: string | null;
}

export const findProjectDoc = async (projectId: string): Promise<ProjectDocRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_docs')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProjectDocRow | null) ?? null;
};

export const upsertProjectDoc = async (
  projectId: string,
  values: ProjectDocWriteColumns
): Promise<ProjectDocRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_docs')
    .upsert({ project_id: projectId, ...values }, { onConflict: 'project_id' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ProjectDocRow;
};
