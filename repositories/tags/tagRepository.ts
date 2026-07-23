import { createClient } from '@/lib/supabase/server';

// Repository layer: pure Supabase data access for `tags` and the
// `project_tags` join. No business rules.

export const findAllTags = async (): Promise<{ id: string; name: string }[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('tags').select('id, name').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
};

// Upserts tag names and returns their ids. Names should be pre-trimmed/deduped.
export const upsertTags = async (names: string[]): Promise<{ id: string; name: string }[]> => {
  if (names.length === 0) return [];
  const supabase = await createClient();
  const { error: upsertError } = await supabase
    .from('tags')
    .upsert(names.map((name) => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
  if (upsertError) throw new Error(upsertError.message);

  const { data, error } = await supabase.from('tags').select('id, name').in('name', names);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
};

// Replaces a project's tag links with exactly the given tag ids.
export const replaceProjectTags = async (
  projectId: string,
  tagIds: string[]
): Promise<void> => {
  const supabase = await createClient();
  const { error: delError } = await supabase
    .from('project_tags')
    .delete()
    .eq('project_id', projectId);
  if (delError) throw new Error(delError.message);

  if (tagIds.length === 0) return;
  const { error } = await supabase
    .from('project_tags')
    .insert(tagIds.map((tagId) => ({ project_id: projectId, tag_id: tagId })));
  if (error) throw new Error(error.message);
};
