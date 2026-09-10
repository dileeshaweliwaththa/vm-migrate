-- Database backups: the registry of backup services.
--
-- `upview-db-backup-tracker` is a standalone service (Node/Express) that dumps
-- MySQL databases, gzips them, ships them to Azure Blob, and keeps its own
-- history — one deployment per MySQL host, exposed over HTTP on port 2999. It
-- already owns that data, so the portal reads through to it rather than
-- duplicating any of it: the same arrangement as Jenkins.
--
-- What the portal has to store is therefore only *where the services are*. One
-- row per service:
--
--   * `base_url` — the service root. Normalized on write, where a missing port
--     becomes 2999 (the service's default).
--   * `vm_id`    — the machine it runs on, when that machine is one the tracker
--     knows. Optional and `on delete set null`: a service on a host we don't
--     track is still worth watching, and removing a VM must not remove the
--     record of its backups.
--
-- **No credentials table.** The service's HTTP API is unauthenticated — its
-- `/api/auth/login` gates its own web UI only, every `/api/*` route is open and
-- `cors()` is on — so there is nothing to store, and nothing that would make
-- this table sensitive. That is an accepted risk of the service itself, recorded
-- in docs/security.md.

create table public.backup_services (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  base_url   text not null default '',
  vm_id      uuid references public.vms (id) on delete set null,
  notes      text not null default '',
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index backup_services_vm_id_idx on public.backup_services (vm_id);

create trigger set_backup_services_updated_at
  before update on public.backup_services
  for each row execute function public.set_updated_at();

-- RLS: the standard split. A base URL is not a secret — every signed-in role can
-- see which databases are backed up and read the history; changing the registry
-- is editor+ work.
alter table public.backup_services enable row level security;

create policy "Authenticated users can read backup_services"
  on public.backup_services for select
  to authenticated
  using (true);

create policy "Editors and admins can write backup_services"
  on public.backup_services for all
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));
