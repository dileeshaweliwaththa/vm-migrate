-- A scheduled backup that cannot be sent should say why.
--
-- The job command inlined `net.http_post(url := (select … from vault …), …)`.
-- When a secret is absent that subquery is NULL, so the post is attempted with
-- no URL and no token, and pg_cron records:
--
--   ERROR: null value in column "url" of relation "http_request_queue"
--   violates not-null constraint  DETAIL: Failing row contains (1, POST, null…
--
-- which describes pg_net's internals rather than the one fact that matters:
-- `backup_cron_url` was never created. Every five minutes, for as long as the
-- schedule is on.
--
-- So the command now calls a function that checks first and raises a sentence a
-- person can act on. It also gives the job one short, readable command instead
-- of a formatted block, and one place to change how the call is made.

create or replace function public.run_backup_cron_job(p_target uuid)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_url   text;
  v_token text;
begin
  -- Read at firing time, never baked into `cron.job.command`: rotating either
  -- one is a single statement and takes effect on the next run.
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'backup_cron_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'backup_cron_secret';

  if coalesce(v_url, '') = '' then
    raise exception
      'backup_cron_url is not set in Supabase Vault, so the scheduled backup for target % cannot be sent. See docs/backups.md, or press Test schedule on the target page.',
      p_target;
  end if;

  if coalesce(v_token, '') = '' then
    raise exception
      'backup_cron_secret is not set in Supabase Vault, so the app would refuse the scheduled backup for target %. See docs/backups.md, or press Test schedule on the target page.',
      p_target;
  end if;

  return net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := jsonb_build_object('targetId', p_target::text),
    -- The app answers as soon as the run has *started*; the dump itself takes
    -- minutes and nothing here waits for it.
    timeout_milliseconds := 10000
  );
end
$$;

revoke all on function public.run_backup_cron_job(uuid) from public;

-- The schedule sync, now scheduling that call.
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
  then
    return;
  end if;

  perform cron.schedule(
    v_job,
    v_row.cron_schedule,
    format('select public.run_backup_cron_job(%L::uuid);', p_target)
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
