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
   project detail (name, tags, description, environments, records, VM links).
3. It calls Gemini (`@google/genai`) with a fixed system prompt (a section
   skeleton: Overview / Architecture / Environments / Deployment / Ports /
   Runbook) plus the admin's house-style prompt, asking for a clean HTML
   fragment.

### What the model is given about records

`buildProjectContext` spells out **every field of every record**, because the model
can only write about what it's handed, and endpoints are the most useful thing in
the document:

```
Environments: 2. Records (deployed endpoints) in total: 1.
  - DEV, CI/CD: jenkins, Jenkins: http://…/job/IMAUI/, notes: IMAUI Deployment
    records for DEV (1):
    - port 3000; protocol HTTPS; domain dev.imaui.upview.tech; name "IMAUI";
      reachable at https://dev.imaui.upview.tech:3000; from its Jenkins job;
      Jenkins job http://…/job/IMAUI/
  - PRODUCTION, CI/CD: other
    - no records (ports/domains) recorded for PRODUCTION yet
```

Details that matter:

- **The URL is computed, not guessed.** `recordUrl` in [`lib/endpoints.ts`](../lib/endpoints.ts)
  builds it from protocol + domain + port (eliding `:443`/`:80`, tolerating a
  domain pasted with a scheme, returning `null` for TCP/UDP). A hallucinated
  endpoint in deployment docs is worse than no endpoint, so it never comes from
  the model. `recordLiveUrl` alongside it adds the record's **direct address on
  the VM** (`http://ip:port`, from the environment's `vmIp`) as a separate,
  separately-labelled line — it exists whether or not a domain has been pointed at
  the record yet, which during a migration is often the only way in. See
  [The Link column](./jenkins-sync.md#the-link-column).
- **Blank fields are labelled `NOT RECORDED YET`** and the prompt forbids guessing
  them. A record added via Jenkins "Use" or a docker import may legitimately have
  no port or domain yet.
- **Provenance is included** in words (`entered manually` / `from its Jenkins job`
  / `imported from docker ps`).
- **The record total is stated** so the prompt can require the Ports section to
  account for all of them — a model left to its own devices summarises a couple
  and moves on.
- **Environments with no records say so**, rather than being silently absent.

The prompt carries two hard requirements: each environment gets an `h3` in
**Environments** listing all its records with domain and port, and **Ports**
accounts for every record across all environments.

### Why no tables

The returned HTML is parsed back into Tiptap JSON with `tiptapExtensions`, which is
`[StarterKit]` — **no table extension**. A `<table>` would be silently dropped on
the way in, so the prompt's tag allowlist excludes it and asks for lists instead.
If tables are ever wanted here, the extension has to be added to
`lib/tiptap/extensions.ts` first (it feeds both the editor and the server render).
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
