# Project Documentation & AI Generation

Phase 2 · M2. Each project has one rich-text documentation page, edited with
**Tiptap** and optionally drafted by **Gemini**. Data lives in `project_docs`
(see [schema.md](./schema.md)); the Gemini config lives in `app_settings` (see
[settings.md](./settings.md)).

## Documentation editor (C2)

- **Engine:** Tiptap (`@tiptap/react` + `@tiptap/starter-kit`). It is a headless
  editor, not a UI kit, so it is compatible with the shadcn-only rule — the
  toolbar (`components/docs/doc-toolbar.tsx`) is built entirely from shadcn
  Buttons and `lucide-react` icons.
- **Storage:** the Tiptap document **JSON** (`content_json`) is canonical and
  re-editable. On every save the service re-derives **HTML** (`content_html`)
  from that JSON with `generateHTML` and the shared extension set — the client's
  HTML is never trusted. Viewers get the rendered HTML only (no editor bundle),
  styled with `@tailwindcss/typography` `prose` (+ `dark:prose-invert`).
- **Single schema source:** `lib/tiptap/extensions.ts` exports the one extension
  list used by both the client editor and the server-side render, so the two
  can't drift.
- **Roles:** editors/admins get the editor; viewers get the read-only view.
  `project_docs` RLS enforces write = `editor`/`admin` authoritatively.

| Layer      | File                                                          |
| ---------- | ------------------------------------------------------------- |
| Routing    | `app/api/projects/[id]/docs/route.ts` (GET / PUT)             |
| UI         | `components/docs/*` (`documentation-section`, `doc-editor`, `doc-toolbar`, `doc-view`) |
| Hook       | `hooks/docs/useProjectDoc.ts`                                 |
| Service    | `services/docs/docService.ts`                                 |
| Repository | `repositories/projectDocs/projectDocRepository.ts`            |

The editor is surfaced on the project detail page under a **Documentation** tab
(alongside **Environments**).

## AI generation (C3)

The **Generate by AI** button drafts a doc from the project's structured data:

1. `useGenerateDocs` → `POST /api/ai/generate-docs` with the `projectId`.
2. `aiService.generateProjectDocs` re-checks the caller is `editor`/`admin`,
   resolves the Gemini config server-side (`getGeminiConfig`), and loads the
   project detail (name, tags, description, environments, ports, VM links).
3. It calls Gemini (`@google/genai`) with a fixed system prompt (a section
   skeleton: Overview / Architecture / Environments / Deployment / Ports /
   Runbook) plus the admin's house-style prompt, asking for a clean HTML
   fragment.
4. The HTML is converted to Tiptap JSON (`generateJSON`) and returned.
5. The editor loads the draft (`setContent`); the user reviews and **Saves** —
   nothing is persisted by the generation route itself. Saving marks
   `generated_by_ai`.

The key is read only on the server (service-role) and never sent to the browser.
If no key is configured (row empty and no `GEMINI_API_KEY` env), generation
returns a clear "AI is not configured" message.

## Setup

An admin sets the Gemini key, model, and house-style prompt in **Settings**
(`/admin/settings`), or an operator sets `GEMINI_API_KEY` in the server env as
an MVP fallback. The **model is chosen from a dropdown** populated live from the
Gemini API (`GET /api/ai/models` → `aiService.listGeminiModels`, filtered to
models supporting `generateContent`); before a key is saved it falls back to the
static `GEMINI_MODEL_FALLBACKS` list. Default: `gemini-2.0-flash`.
