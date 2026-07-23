-- Phase 2 · the `environments` and `environment_ports` tables.
--
-- Each project has zero-to-many environments (dev/staging/prod/custom). An
-- environment carries its CI/CD wiring (Jenkins URL or other provider), the
-- deployed URL, and an optional link to a VM in the tracker. Ports live in a
-- child table (mirrors vm_urls) and record their provenance (manual vs a future
-- Jenkins sync). Same role-based RLS as projects.

create table public.environments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  name          text not null default '',
  cicd_provider text not null default 'none'
    check (cicd_provider in ('jenkins', 'aws', 'azure', 'amplify', 'other', 'none')),
  jenkins_url   text not null default '',
  deploy_url    text not null default '',
  vm_id         uuid references public.vms (id) on delete set null,
  notes         text not null default '',
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index environments_project_id_idx on public.environments (project_id);
create index environments_vm_id_idx      on public.environments (vm_id);

create trigger set_updated_at
  before update on public.environments
  for each row execute function public.set_updated_at();

create table public.environment_ports (
  id             uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments (id) on delete cascade,
  port           text not null default '',
  protocol       text not null default 'HTTPS'
    check (protocol in ('HTTP', 'HTTPS', 'TCP', 'UDP', 'WS', 'WSS')),
  description    text not null default '',
  source         text not null default 'manual'
    check (source in ('manual', 'jenkins')),
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index environment_ports_environment_id_idx
  on public.environment_ports (environment_id);

create trigger set_updated_at
  before update on public.environment_ports
  for each row execute function public.set_updated_at();

-- RLS: read = any authenticated user, write = editor|admin (deletes of child
-- rows are edits to a project's config, so editors may delete them; whole
-- projects remain admin-only to delete).
alter table public.environments enable row level security;
alter table public.environment_ports enable row level security;

create policy "Authenticated users can read environments"
  on public.environments for select to authenticated using (true);
create policy "Editors and admins can write environments"
  on public.environments for all to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));

create policy "Authenticated users can read environment_ports"
  on public.environment_ports for select to authenticated using (true);
create policy "Editors and admins can write environment_ports"
  on public.environment_ports for all to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));
