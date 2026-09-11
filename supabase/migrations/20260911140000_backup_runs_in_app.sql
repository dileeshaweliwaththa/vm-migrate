-- Backups, part 4: the app performs the dump, and owns the history.
--
-- The worker container was one more thing to deploy, to keep in step with this
-- app's configuration, and to reach over HTTP — and it wrote every dump to its
-- own disk before uploading it. None of that is necessary: this app runs as a
-- long-lived Node process in a container we build, so it can run `mysqldump`
-- itself and stream the output straight to Azure Blob Storage:
--
--   mysqldump (stdout) → gzip → Azure uploadStream        nothing on disk
--
-- (Edge Functions could not do this — 2s of CPU, 256MB, no binaries. The app's
-- own runtime has none of those limits, which is the distinction that was
-- missed the first time round.)
--
-- What Supabase gains is the history. Until now "what has been backed up" lived
-- in the worker's own MySQL, which is also where its progress log went, written
-- fire-and-forget. Now:
--
--   * `backup_runs`       — one row per dump attempt: which database, how big,
--                           how long, where it landed in Azure, and why it failed
--   * `backup_run_events` — the progress lines of a run, so a page opened after
--                           it started can still show what happened
--
-- The blobs in the Azure container remain the backups themselves. These tables
-- are the record *about* them.

-- 1) Runs ---------------------------------------------------------------------
do $$
begin
  create type public.backup_run_status as enum ('running', 'success', 'failed');
exception
  when duplicate_object then null;
end
$$;

create table public.backup_runs (
  id           uuid primary key default gen_random_uuid(),
  target_id    uuid not null references public.backup_targets (id) on delete cascade,
  -- Groups the dumps of one triggering into a single run, the way the worker's
  -- "session" did: 18 databases at 02:00 is one batch, not 18 unrelated events.
  batch_id     uuid not null,
  database_name text not null default '',
  -- The blob name, which is also the dump's identity in Azure:
  -- `<database>/<database>_<timestamp>.sql.gz`.
  blob_name    text not null default '',
  -- Bytes uploaded. Known only once the stream has finished, so 0 while running.
  size_bytes   bigint not null default 0,
  duration_ms  integer not null default 0,
  status       public.backup_run_status not null default 'running',
  error        text not null default '',
  source       public.backup_dispatch_source not null default 'manual',
  -- Null for a scheduled run, which is nobody.
  requested_by uuid references auth.users (id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index backup_runs_target_idx on public.backup_runs (target_id, started_at desc);
create index backup_runs_batch_idx on public.backup_runs (batch_id);

-- 2) Progress -----------------------------------------------------------------
-- One row per step, which is what the log panel renders. Written by the app as
-- the dump proceeds, so the lines survive a page reload and a run that nobody
-- was watching — unlike the worker's in-memory SSE.
create table public.backup_run_events (
  id         bigserial primary key,
  batch_id   uuid not null,
  target_id  uuid not null references public.backup_targets (id) on delete cascade,
  -- 'start' | 'db_dump' | 'db_upload' | 'db_done' | 'db_error' | 'retention' |
  -- 'complete'. Text, not an enum: these are this app's own vocabulary and
  -- adding a step should not need a migration.
  type       text not null,
  database_name text not null default '',
  message    text not null default '',
  created_at timestamptz not null default now()
);

create index backup_run_events_batch_idx on public.backup_run_events (batch_id, id);

-- 3) RLS ----------------------------------------------------------------------
-- Read = any authenticated user, like the rest of the backups feature. **No
-- write policies**: every write comes from the app's own runner via the
-- service-role client, because a scheduled run has no session to write as.
alter table public.backup_runs enable row level security;
alter table public.backup_run_events enable row level security;

create policy "Authenticated users can read backup_runs"
  on public.backup_runs for select
  to authenticated
  using (true);

create policy "Authenticated users can read backup_run_events"
  on public.backup_run_events for select
  to authenticated
  using (true);

-- 4) The worker is no longer required -----------------------------------------
-- Kept as a column rather than dropped: an image rolled back to the previous
-- build still reads it, and a target that has not been migrated to the in-app
-- runner still has somewhere to point. Nothing new writes to it.
comment on column public.backup_targets.worker_url is
  'Legacy: the external backup worker. The app now performs dumps itself and streams them to Azure; see docs/backups.md.';
