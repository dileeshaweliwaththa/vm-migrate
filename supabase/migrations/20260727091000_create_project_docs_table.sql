-- Phase 2 · M2 · the `project_docs` table (Tiptap documentation, 1-to-1 with a
-- project).
--
-- Stores the Tiptap document as canonical JSON (`content_json`, re-editable)
-- plus a rendered HTML copy (`content_html`) for cheap read-only viewing by
-- viewers (no editor bundle needed). `generated_by_ai` records whether the last
-- save came from the "Generate by AI" flow. See phase-2-plan.md §3.5 and §6.

create table public.project_docs (
  project_id      uuid primary key references public.projects (id) on delete cascade,
  content_json    jsonb not null default '{}'::jsonb,
  content_html    text not null default '',
  generated_by_ai boolean not null default false,
  updated_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.project_docs
  for each row execute function public.set_updated_at();

-- RLS: read = any authenticated user, write = editor|admin (same as projects).
alter table public.project_docs enable row level security;

create policy "Authenticated users can read project_docs"
  on public.project_docs for select
  to authenticated
  using (true);

create policy "Editors and admins can write project_docs"
  on public.project_docs for all
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));
