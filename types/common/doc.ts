import type { JSONContent } from '@tiptap/core';

// Domain type for a project's documentation (Phase 2 · M2). The Tiptap document
// JSON is canonical and re-editable; the HTML is derived server-side for cheap
// read-only rendering.
export interface ProjectDoc {
  projectId: string;
  contentJson: JSONContent;
  contentHtml: string;
  generatedByAi: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

// Write payload from the editor. HTML is always re-derived server-side from the
// JSON, so it is never accepted from the client.
export interface ProjectDocInput {
  contentJson: JSONContent;
  generatedByAi?: boolean;
}
