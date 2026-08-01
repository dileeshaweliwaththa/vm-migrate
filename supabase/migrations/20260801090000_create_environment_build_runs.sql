-- Phase 2b · build history: who started which Jenkins build, and how it ended.
--
-- Two things change with this table:
--   1. A triggered run is no longer only client-side state (a TanStack cache
--      entry) — it is a row, so a run survives a reload and is visible to the
--      whole team, not just the person who started it.
--   2. Running a build is opened up to **viewers**. Triggering a deployment job
--      is an everyday action here, and the accountability that used to come from
--      "only editors can build" now comes from this audit trail instead.
--
-- Hence the write policies: any authenticated user may insert a run, but only as
-- themselves (`triggered_by = auth.uid()`), and may only update their own run —
-- the poller that follows a run belongs to whoever started it. Nobody can edit
-- someone else's row, so the trail can't be rewritten; only an admin can delete.

-- Mirrors the TS `JENKINS_RUN_PHASES` const (same values, same order).
do $$ begin
  create type public.jenkins_run_phase as enum (
    'QUEUED', 'RUNNING', 'DONE', 'CANCELLED', 'UNKNOWN'
  );
exception when duplicate_object then null; end $$;

-- Mirrors the TS `JENKINS_STATUSES` const (same values, same order).
do $$ begin
  create type public.jenkins_build_status as enum (
    'SUCCESS', 'FAILED', 'UNSTABLE', 'ABORTED', 'DISABLED',
    'NOT_BUILT', 'PENDING', 'BUILDING', 'UNKNOWN'
  );
exception when duplicate_object then null; end $$;

create table public.environment_build_runs (
  id                 uuid primary key default gen_random_uuid(),
  environment_id     uuid not null references public.environments (id) on delete cascade,
  -- The record the build was started from. Nullable so history outlives the row
  -- (and covers builds run from the browse-jobs dialog, which has no record).
  port_id            uuid references public.environment_ports (id) on delete set null,
  job_url            text not null default '',
  job_name           text not null default '',
  -- Jenkins' queue item for this run, and the build it became. The queue URL is
  -- the only handle on *this* run at trigger time; the build URL supersedes it
  -- once an executor picks the run up (queue items expire, builds don't).
  queue_url          text not null default '',
  build_url          text not null default '',
  build_number       integer,
  phase              public.jenkins_run_phase not null default 'QUEUED',
  result             public.jenkins_build_status,
  triggered_by       uuid references auth.users (id) on delete set null,
  -- Snapshot of who ran it. `profiles` is only readable by its owner (and
  -- admins), so joining it would show a viewer "—" for everyone else's runs. The
  -- label is denormalised here on purpose; it also survives a user being deleted.
  triggered_by_email text not null default '',
  triggered_by_name  text not null default '',
  finished_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- The history list is always "this environment, newest first".
create index environment_build_runs_environment_idx
  on public.environment_build_runs (environment_id, created_at desc);
-- The progress poller finds a run by whichever handle it currently holds.
create index environment_build_runs_queue_url_idx
  on public.environment_build_runs (queue_url);
create index environment_build_runs_build_url_idx
  on public.environment_build_runs (build_url);

create trigger set_updated_at
  before update on public.environment_build_runs
  for each row execute function public.set_updated_at();

alter table public.environment_build_runs enable row level security;

create policy "Authenticated users can read build runs"
  on public.environment_build_runs for select to authenticated using (true);

create policy "Authenticated users can record their own build runs"
  on public.environment_build_runs for insert to authenticated
  with check (triggered_by = auth.uid());

create policy "Users can update their own build runs"
  on public.environment_build_runs for update to authenticated
  using (triggered_by = auth.uid())
  with check (triggered_by = auth.uid());

create policy "Admins can delete build runs"
  on public.environment_build_runs for delete to authenticated
  using (public.current_user_role() = 'admin');
