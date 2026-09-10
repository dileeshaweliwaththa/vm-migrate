-- Backups, part 3: the schedule runs in Postgres.
--
-- `node-cron` inside the worker container was the schedule, which meant it was
-- invisible from here, unchangeable from here, and gone whenever that container
-- was redeployed. pg_cron is the same five-field expression evaluated by the
-- database this app already trusts, so a target's `cron_schedule` column *is*
-- the schedule rather than a description of one somewhere else.
--
-- Shape:
--
--   pg_cron (per target, its own expression)
--     └─ net.http_post → the `backup-dispatch` Edge Function
--          └─ POST worker /api/backup  — fire, don't wait: the dump takes
--             minutes and nothing here should hold a connection open for it
--
-- The Edge Function is what needs a URL and a key, and both are read from
-- **Vault at execution time** rather than baked into the job command, so
-- rotating either one does not mean rewriting every job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One job per target, named after it so it can be found and replaced.
create or replace function public.backup_target_job_name(p_target uuid)
returns text
language sql
immutable
as $$
  select 'backup_target_' || replace(p_target::text, '-', '');
$$;

-- Creates, replaces or removes the pg_cron job for one target, to match the row.
--
-- `security definer` because `cron.schedule` and the Vault views are not
-- reachable by the app's roles — this function is the only door to them, it
-- takes an id and nothing else, and it writes no caller-supplied text into the
-- command it builds (the schedule is validated by pg_cron itself).
create or replace function public.sync_backup_target_schedule(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public, cron, vault, net
as $$
declare
  v_job    text := public.backup_target_job_name(p_target);
  v_row    public.backup_targets;
  v_exists boolean;
begin
  select * into v_row from public.backup_targets where id = p_target;

  -- Always clear the old job first: this function is "make reality match the
  -- row", and a schedule that changed must not leave its predecessor running.
  select exists (select 1 from cron.job where jobname = v_job) into v_exists;
  if v_exists then
    perform cron.unschedule(v_job);
  end if;

  if v_row.id is null
     or not v_row.schedule_enabled
     or coalesce(v_row.cron_schedule, '') = ''
     or coalesce(v_row.worker_url, '') = ''
  then
    return;
  end if;

  -- The URL and key are looked up *inside* the command, so they are not copied
  -- into `cron.job.command` and a rotation is picked up on the next firing.
  -- `timeout_milliseconds` is short on purpose: the function answers as soon as
  -- it has handed the work to the worker.
  perform cron.schedule(
    v_job,
    v_row.cron_schedule,
    format(
      $cmd$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'backup_dispatch_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'backup_dispatch_key')
        ),
        body := jsonb_build_object('targetId', %L::text),
        timeout_milliseconds := 10000
      );
      $cmd$,
      p_target
    )
  );
end
$$;

revoke all on function public.sync_backup_target_schedule(uuid) from public;

-- Keep the jobs in step with the table, so no code path can change a schedule
-- without the schedule changing. A delete is covered too: the row is gone by
-- the time this runs, so `sync` finds nothing and unschedules.
create or replace function public.backup_targets_sync_schedule_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_backup_target_schedule(old.id);
    return old;
  end if;
  perform public.sync_backup_target_schedule(new.id);
  return new;
end
$$;

create trigger backup_targets_sync_schedule
  after insert or update of cron_schedule, schedule_enabled, worker_url
  on public.backup_targets
  for each row execute function public.backup_targets_sync_schedule_trigger();

create trigger backup_targets_unsync_schedule
  after delete on public.backup_targets
  for each row execute function public.backup_targets_sync_schedule_trigger();

-- ---------------------------------------------------------------------------
-- Setup, once per project (values differ per environment, so they are not in
-- this migration):
--
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/backup-dispatch',
--     'backup_dispatch_url'
--   );
--   select vault.create_secret('<service-role-key>', 'backup_dispatch_key');
--
-- Then deploy the function and re-sync every target so the jobs pick the
-- secrets up:
--
--   supabase functions deploy backup-dispatch
--   select public.sync_backup_target_schedule(id) from public.backup_targets;
--
-- Until the secrets exist the jobs are still created; they post to a null URL
-- and pg_net records the failure, which is visible in `net._http_response`.
-- See docs/backups.md § Scheduling.
