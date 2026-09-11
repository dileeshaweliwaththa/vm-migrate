-- The schedule now calls the app, not an Edge Function.
--
-- The previous version posted to `backup-dispatch`, whose only job was to reach
-- the external worker. The app performs the dump itself now, so the hop is gone:
--
--   pg_cron → net.http_post → POST <app>/api/backups/cron   { targetId }
--
-- That route is the one place in the app authenticated by a shared token rather
-- than a session (pg_cron has no user to be). Both the URL and the token are
-- read from Vault **inside** the job command, so rotating either is one
-- statement and neither is copied into `cron.job`.
--
-- Requires: the app reachable from Supabase, `BACKUP_CRON_SECRET` set in the
-- app's environment, and the two secrets below. Until they exist the jobs are
-- created but their POSTs fail, which shows up in `net._http_response` — and in
-- the app as a schedule that never dispatched.

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

  -- No `worker_url` condition any more — the app is what runs the backup, so a
  -- schedule needs only a target and an expression.
  if v_row.id is null
     or not v_row.schedule_enabled
     or coalesce(v_row.cron_schedule, '') = ''
  then
    return;
  end if;

  perform cron.schedule(
    v_job,
    v_row.cron_schedule,
    format(
      $cmd$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'backup_cron_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'backup_cron_secret')
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

-- Re-point every existing job at the new command in one pass.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.backup_targets loop
    perform public.sync_backup_target_schedule(v_id);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Setup, once per project (values differ per environment):
--
--   select vault.create_secret(
--     'https://portal.example.com/api/backups/cron',   -- this app, reachable
--     'backup_cron_url'                                 -- from Supabase
--   );
--   select vault.create_secret('<BACKUP_CRON_SECRET>', 'backup_cron_secret');
--   select public.sync_backup_target_schedule(id) from public.backup_targets;
--
-- The old `backup_dispatch_url` / `backup_dispatch_key` secrets and the
-- `backup-dispatch` Edge Function are no longer used and can be deleted.
-- See docs/backups.md § Scheduling.
