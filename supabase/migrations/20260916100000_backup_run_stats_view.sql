-- One row per target, summarising its `backup_runs`.
--
-- The Backups index used to build its cards by reading every run row for every
-- target and counting them in Node — 200 rows a target, of which it used
-- `length`, the newest timestamp and how many had failed. Those are three
-- aggregates, and Postgres is where aggregates belong: the page now fetches one
-- small row per target however many thousand dumps are behind it.
--
-- `security_invoker = on` so the view is read as the caller, not as its owner:
-- RLS on `backup_runs` still decides who sees what, exactly as it does for a
-- direct select. Without it a view would hand every row's counts to anyone.
--
-- `last_running_at` rather than an `is_running` flag: whether a `running` row is
-- a live run or a container that died is decided by a cutoff, and that cutoff
-- (`STALE_RUN_MS`) is the runner's — it must not be re-typed as an interval
-- here, where it could drift from the value the runner enforces.
create or replace view public.backup_run_stats
with (security_invoker = on) as
select
  target_id,
  count(*)                                                as total_runs,
  count(*) filter (where status = 'failed')               as failed_runs,
  max(started_at)                                         as last_started_at,
  max(started_at) filter (where status = 'running')       as last_running_at
from public.backup_runs
group by target_id;

comment on view public.backup_run_stats is
  'Per-target aggregates over backup_runs for the Backups index. security_invoker, so RLS on backup_runs applies.';

-- Same audience as the table it summarises: every signed-in role reads the
-- backup history, and the runner reads it without a session.
grant select on public.backup_run_stats to authenticated, service_role;
