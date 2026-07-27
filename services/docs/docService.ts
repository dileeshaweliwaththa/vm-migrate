import { generateHTML } from '@tiptap/html';
import type { JSONContent } from '@tiptap/core';
import { getAuthenticatedUser } from '@/repositories/auth/authRepository';
import { findProjectDoc, upsertProjectDoc } from '@/repositories/projectDocs/projectDocRepository';
import { tiptapExtensions, EMPTY_DOC } from '@/lib/tiptap/extensions';
import type { ProjectDoc, ProjectDocInput } from '@/types/common/doc';
import type { ProjectDocRow } from '@/types/supabase/response/projectDocs';

// Service layer: project documentation. HTML is always re-derived from the
// canonical Tiptap JSON on save (never trusted from the client), using the same
// extension set the editor uses so the two can't drift. Role enforcement is via
// RLS on project_docs plus role-aware UI.

const rowToDoc = (row: ProjectDocRow): ProjectDoc => ({
  projectId: row.project_id,
  contentJson: row.content_json ?? EMPTY_DOC,
  contentHtml: row.content_html,
  generatedByAi: row.generated_by_ai,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
});

// Renders Tiptap JSON to HTML; tolerates malformed JSON by returning empty HTML
// rather than throwing (a bad doc must never break the whole project page).
export const renderDocHtml = (json: JSONContent): string => {
  try {
    return generateHTML(json, tiptapExtensions);
  } catch {
    return '';
  }
};

export const getProjectDoc = async (projectId: string): Promise<ProjectDoc | null> => {
  const row = await findProjectDoc(projectId);
  return row ? rowToDoc(row) : null;
};

export const saveProjectDoc = async (
  projectId: string,
  input: ProjectDocInput
): Promise<ProjectDoc> => {
  const json = input.contentJson ?? EMPTY_DOC;
  const user = await getAuthenticatedUser();
  const row = await upsertProjectDoc(projectId, {
    content_json: json,
    content_html: renderDocHtml(json),
    generated_by_ai: input.generatedByAi ?? false,
    updated_by: user?.id ?? null,
  });
  return rowToDoc(row);
};
