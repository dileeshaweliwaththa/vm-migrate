import type { JSONContent } from '@tiptap/core';

export interface ProjectDocRow {
  project_id: string;
  content_json: JSONContent;
  content_html: string;
  generated_by_ai: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
