import { StarterKit } from '@tiptap/starter-kit';
import type { Extensions, JSONContent } from '@tiptap/core';

// Single source of truth for the Tiptap schema. Shared by the client editor
// (components/docs) and the server-side HTML/JSON conversion (docService), so
// the two never drift. StarterKit is framework-agnostic — safe to import on the
// server (unlike @tiptap/react, which must stay client-only).
export const tiptapExtensions: Extensions = [StarterKit];

// An empty Tiptap document (used when a project has no doc yet).
export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
