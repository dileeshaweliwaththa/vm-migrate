-- Backups, part 2: Supabase owns the configuration and the credentials.
--
-- The first cut stored only a URL — where the backup container was — and left
-- the MySQL host, its user, its password, the Azure connection string and the
-- retention policy in a `.env` on that box. That does not survive a second
-- database: adding one meant editing a file on a host and restarting it, and the
-- credentials existed nowhere anyone could rotate them from.
--
-- So a **target** is now the unit: a MySQL server we back up, its Azure
-- destination, its schedule, and the worker that does the dumping for it.
--
--   * `backup_targets`        — the non-secret configuration (host, port, user,
--                               Azure account/container, retention, schedule)
--   * `backup_target_secrets` — the DB password and the Azure connection string,
--                               service-role only
--   * `backup_dispatches`     — what we asked to run and when, so a schedule that
--                               silently stopped firing is visible
--
-- `vm_id` is dropped. A backup target is a *database server* — mencartdb is Azure
-- Database for MySQL, not a machine in the tracker — and tying it to a VM said
-- something untrue about most of them.
--
-- The dump itself stays in the worker container. Edge Functions cap CPU time at
-- 2s with 256MB of memory and have no mysqldump; a 64MB dump that takes 245s of
-- real work does not fit, and hand-rolling mysqldump in Deno would be a
-- correctness problem (views, triggers, charsets, FK ordering) rather than a
-- performance one. Supabase takes the parts it is good at: the schedule
-- (pg_cron, next migration), the configuration, and the secrets.

-- 1) The target ---------------------------------------------------------------
alter table public.backup_services rename to backup_targets;
alter index if exists backup_services_vm_id_idx rename to backup_targets_vm_id_idx;

-- `base_url` is the *worker's* address, which is not the target's identity — the
-- database server is. Renamed to say which of the two it is.
alter table public.backup_targets rename column base_url to worker_url;

drop index if exists backup_targets_vm_id_idx;
alter table public.backup_targets drop column if exists vm_id;

alter table public.backup_targets
  -- What the worker connects to. `db_name` is deliberately absent: the service
  -- enumerates the server's databases and backs up each one, which is what makes
  -- "18 databases" a property of the server rather than 18 rows here.
  add column if not exists db_host text not null default '',
  add column if not exists db_port integer not null default 3306,
  add column if not exists db_user text not null default '',
  -- Where the dumps go. The connection string is a secret and lives next door;
  -- the account and container names are not.
  add column if not exists azure_account text not null default '',
  add column if not exists azure_container text not null default '',
  add column if not exists retention_days integer not null default 7,
  -- Standard five-field cron, handed straight to pg_cron (next migration), so
  -- the schedule this app shows is the schedule that actually runs.
  add column if not exists cron_schedule text not null default '0 2 * * *',
  add column if not exists schedule_enabled boolean not null default false;

-- 2) The secrets --------------------------------------------------------------
-- Same construction as `vm_jenkins_secrets` and `environment_secrets`: RLS
-- **on with no policies**, so no authenticated client can read or write it. Only
-- server code reaches it, via the service-role client, behind an editor check —
-- and the values are never sent back to a browser. `hasPassword` booleans are
-- what the UI gets.
create table public.backup_target_secrets (
  target_id                uuid primary key references public.backup_targets (id) on delete cascade,
  db_password              text not null default '',
  azure_connection_string  text not null default '',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger set_backup_target_secrets_updated_at
  before update on public.backup_target_secrets
  for each row execute function public.set_updated_at();

alter table public.backup_target_secrets enable row level security;

-- 3) Dispatch audit -----------------------------------------------------------
do $$
begin
  create type public.backup_dispatch_source as enum ('schedule', 'manual');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.backup_dispatch_status as enum ('dispatched', 'failed');
exception
  when duplicate_object then null;
end
$$;

-- Why this exists: the *outcome* of a backup is in the worker's own history, and
-- the portal reads it from there. What the worker cannot tell us is whether it
-- was ever asked — a schedule that stopped firing looks exactly like a schedule
-- with nothing to do. This row is written at the moment of asking.
create table public.backup_dispatches (
  id           uuid primary key default gen_random_uuid(),
  target_id    uuid not null references public.backup_targets (id) on delete cascade,
  source       public.backup_dispatch_source not null default 'schedule',
  status       public.backup_dispatch_status not null default 'dispatched',
  -- The worker's HTTP status, or 0 when it could not be reached at all.
  http_status  integer not null default 0,
  error        text not null default '',
  -- Who asked, for a manual run. Null for the schedule, which is nobody.
  requested_by uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index backup_dispatches_target_idx
  on public.backup_dispatches (target_id, created_at desc);

alter table public.backup_dispatches enable row level security;

create policy "Authenticated users can read backup_dispatches"
  on public.backup_dispatches for select
  to authenticated
  using (true);

create policy "Editors and admins can insert backup_dispatches"
  on public.backup_dispatches for insert
  to authenticated
  with check (public.current_user_role() in ('editor', 'admin'));

-- 4) Rename the existing policies to match the table --------------------------
drop policy if exists "Authenticated users can read backup_services" on public.backup_targets;
drop policy if exists "Editors and admins can write backup_services" on public.backup_targets;

create policy "Authenticated users can read backup_targets"
  on public.backup_targets for select
  to authenticated
  using (true);

create policy "Editors and admins can write backup_targets"
  on public.backup_targets for all
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));
