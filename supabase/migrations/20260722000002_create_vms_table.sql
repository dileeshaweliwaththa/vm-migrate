-- VM Migration Tracker: the `vms` table.
--
-- One row per virtual machine being tracked through a migration. Rows are
-- shared across all authenticated users (this is an internal team tool, not a
-- per-user app), so RLS grants full access to any signed-in user.
--
-- Soft deletes: a "trashed" VM keeps its row with `deleted = true` and a
-- `deleted_at` stamp, so it can be restored or purged. Purging a VM whose URLs
-- were migrated onto a destination VM copies them into that destination's
-- `migrated_archive` (jsonb) so the migrated sub-URLs are never lost.

create table public.vms (
  id               uuid primary key default gen_random_uuid(),
  name             text not null default '',
  old_ip           text not null default '',
  new_ip           text not null default '',
  migrated         boolean not null default false,
  is_supabase      boolean not null default false,
  keep             boolean not null default false,
  is_client        boolean not null default false,
  expanded         boolean not null default true,
  notes            text not null default '',
  migrated_archive jsonb not null default '[]'::jsonb,
  deleted          boolean not null default false,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index vms_deleted_idx on public.vms (deleted);
create index vms_new_ip_idx  on public.vms (new_ip);

-- Keep updated_at fresh (helper lives in 000_helpers.sql).
create trigger set_updated_at
  before update on public.vms
  for each row execute function public.set_updated_at();

-- RLS: shared team tool — any authenticated user has full access.
alter table public.vms enable row level security;

create policy "Authenticated users can read vms"
  on public.vms for select
  to authenticated
  using (true);

create policy "Authenticated users can insert vms"
  on public.vms for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update vms"
  on public.vms for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete vms"
  on public.vms for delete
  to authenticated
  using (true);
