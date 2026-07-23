-- Phase 2 · projects use tags (many-to-many) instead of a single client, and
-- drop project-level repo_url / cicd_provider (CI/CD is per-environment).

-- 1) Tags + join table -----------------------------------------------------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table public.project_tags (
  project_id uuid not null references public.projects (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  primary key (project_id, tag_id)
);

create index project_tags_tag_id_idx on public.project_tags (tag_id);

-- RLS: read = any authenticated user; write = editor|admin (reuses
-- current_user_role()).
alter table public.tags enable row level security;
alter table public.project_tags enable row level security;

create policy "Authenticated users can read tags"
  on public.tags for select to authenticated using (true);
create policy "Editors and admins can write tags"
  on public.tags for all to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));

create policy "Authenticated users can read project_tags"
  on public.project_tags for select to authenticated using (true);
create policy "Editors and admins can write project_tags"
  on public.project_tags for all to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));

-- 2) Migrate existing client values into tags ------------------------------
insert into public.tags (name)
  select distinct client from public.projects
  where client is not null and client <> ''
  on conflict (name) do nothing;

insert into public.project_tags (project_id, tag_id)
  select p.id, t.id
  from public.projects p
  join public.tags t on t.name = p.client
  where p.client is not null and p.client <> ''
  on conflict do nothing;

-- 3) Drop the now-unused project columns (indexes on them drop with them) ---
alter table public.projects drop column if exists client;
alter table public.projects drop column if exists repo_url;
alter table public.projects drop column if exists cicd_provider;
