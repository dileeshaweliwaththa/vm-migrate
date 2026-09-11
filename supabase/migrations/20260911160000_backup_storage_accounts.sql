-- Azure storage is configured once, not per target.
--
-- Every target carried its own `azure_account`, `azure_container` and connection
-- string, which meant the same storage account — and the same key — was typed in
-- again for the second database, and rotating that key meant editing every
-- target. It is one destination shared by all of them, so it becomes its own
-- record:
--
--   * `backup_storage_accounts` — name, account, container (not secret)
--   * `backup_storage_secrets`  — the connection string, service-role only
--   * `backup_targets.storage_id` — which destination this target writes to
--
-- Adding a target is now: database credentials, how long to keep dumps, which
-- storage account, and when to run.
--
-- ## Why a target also gets a `blob_prefix`
--
-- One container now holds the dumps of several databases servers, and two of
-- them can have a database of the same name. Retention deletes by age *within a
-- prefix*, so without one, one target's seven-day policy would delete another
-- target's dumps. The prefix is derived from the name once, at creation, and
-- then left alone: renaming a target must not orphan the blobs already written
-- under its old prefix.

-- 1) The storage account ------------------------------------------------------
create table public.backup_storage_accounts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  -- The Azure Storage account name, e.g. `upviewtechnologies`. Not a secret; it
  -- is half of every blob URL.
  account_name text not null default '',
  -- The container dumps are written into, e.g. `mysql-backups`.
  container    text not null default '',
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_backup_storage_accounts_updated_at
  before update on public.backup_storage_accounts
  for each row execute function public.set_updated_at();

-- RLS: read = any authenticated user (an account and container name are not
-- secret), insert/update/delete = editor|admin.
alter table public.backup_storage_accounts enable row level security;

create policy "Authenticated users can read backup_storage_accounts"
  on public.backup_storage_accounts for select
  to authenticated
  using (true);

create policy "Editors and admins can write backup_storage_accounts"
  on public.backup_storage_accounts for all
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));

-- 2) Its connection string ----------------------------------------------------
-- RLS **on with no policies**, like every other secrets table here: only server
-- code reaches it, via the service-role client, behind a role check. The
-- connection string contains the account key, so it never reaches a browser —
-- the UI is told whether one is stored and nothing else.
create table public.backup_storage_secrets (
  storage_id        uuid primary key references public.backup_storage_accounts (id) on delete cascade,
  connection_string text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger set_backup_storage_secrets_updated_at
  before update on public.backup_storage_secrets
  for each row execute function public.set_updated_at();

alter table public.backup_storage_secrets enable row level security;

-- 3) The target points at one -------------------------------------------------
alter table public.backup_targets
  -- `on delete set null` rather than cascade: removing a storage account must
  -- not delete the record of the databases that were being backed up to it. The
  -- target then has no destination, which the UI reports.
  add column if not exists storage_id uuid references public.backup_storage_accounts (id) on delete set null,
  add column if not exists blob_prefix text not null default '';

create index if not exists backup_targets_storage_idx on public.backup_targets (storage_id);

-- 4) Carry the existing per-target configuration over -------------------------
-- One account per distinct (account, container) pair that is already in use,
-- named after the account so it is recognisable, with the connection string of
-- whichever target had one.
insert into public.backup_storage_accounts (name, account_name, container)
select distinct on (t.azure_account, t.azure_container)
  case
    when coalesce(t.azure_account, '') <> '' then t.azure_account
    else 'Azure storage'
  end,
  coalesce(t.azure_account, ''),
  coalesce(t.azure_container, '')
from public.backup_targets t
where coalesce(t.azure_container, '') <> ''
order by t.azure_account, t.azure_container, t.created_at;

insert into public.backup_storage_secrets (storage_id, connection_string)
select distinct on (a.id)
  a.id,
  s.azure_connection_string
from public.backup_storage_accounts a
join public.backup_targets t
  on coalesce(t.azure_account, '') = a.account_name
 and coalesce(t.azure_container, '') = a.container
join public.backup_target_secrets s on s.target_id = t.id
where coalesce(s.azure_connection_string, '') <> ''
order by a.id, t.created_at
on conflict (storage_id) do nothing;

update public.backup_targets t
set storage_id = a.id
from public.backup_storage_accounts a
where coalesce(t.azure_account, '') = a.account_name
  and coalesce(t.azure_container, '') = a.container
  and t.storage_id is null;

-- A prefix for every existing target, from its name, so retention is scoped
-- from the first run rather than from the first rename.
update public.backup_targets
set blob_prefix = regexp_replace(
      lower(coalesce(nullif(name, ''), db_host, 'target')),
      '[^a-z0-9]+', '-', 'g'
    )
where blob_prefix = '';

-- 5) The per-target Azure columns are legacy ----------------------------------
-- Kept rather than dropped so a rolled-back image still reads them; nothing new
-- writes them.
comment on column public.backup_targets.azure_account is
  'Legacy: superseded by storage_id -> backup_storage_accounts. See docs/backups.md.';
comment on column public.backup_targets.azure_container is
  'Legacy: superseded by storage_id -> backup_storage_accounts. See docs/backups.md.';
comment on column public.backup_target_secrets.azure_connection_string is
  'Legacy: superseded by backup_storage_secrets. See docs/backups.md.';
