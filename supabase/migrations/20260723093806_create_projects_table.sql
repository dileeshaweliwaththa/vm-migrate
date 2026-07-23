-- Phase 2 · the `projects` table.
--
-- One row per deployable project/app (e.g. chex-api). Flat model: `client` is a
-- free-text tag used for grouping/filtering (CHEX/INAI/KOMPETE/UPVIEW/…), not a
-- separate hierarchy. Soft-archive mirrors the VM tracker's trash pattern.
-- RLS reuses public.current_user_role() (see the add_profiles_role migration):
-- read = any authenticated user, write = editor|admin, delete = admin only.

create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  slug          text not null unique,
  client        text not null default '',
  description   text not null default '',
  repo_url      text not null default '',
  cicd_provider text not null default 'none'
    check (cicd_provider in ('jenkins', 'aws', 'azure', 'amplify', 'other', 'none')),
  archived      boolean not null default false,
  archived_at   timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index projects_client_idx   on public.projects (client);
create index projects_archived_idx on public.projects (archived);

create trigger set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "Authenticated users can read projects"
  on public.projects for select
  to authenticated
  using (true);

create policy "Editors and admins can insert projects"
  on public.projects for insert
  to authenticated
  with check (public.current_user_role() in ('editor', 'admin'));

create policy "Editors and admins can update projects"
  on public.projects for update
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));

create policy "Admins can delete projects"
  on public.projects for delete
  to authenticated
  using (public.current_user_role() = 'admin');
