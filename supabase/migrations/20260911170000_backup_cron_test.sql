-- Testing the schedule from the app.
--
-- Everything about a scheduled backup happens where the app cannot see it: the
-- job lives in `cron.job`, its URL and token live in Vault, and the HTTP call is
-- made by pg_net from inside the database. When a schedule silently does
-- nothing there are four candidates and no way to tell them apart:
--
--   1. the job was never created (migrations not pushed, schedule off)
--   2. the Vault secrets are missing, so it posts to a null URL
--   3. Supabase cannot reach the app (private network, wrong URL)
--   4. the token does not match `BACKUP_CRON_SECRET`, so the app returns 401
--
-- These three functions let the app answer all four on demand: read the job and
-- the last run, send one real request down the same path, then read what came
-- back. `/api/backups/cron` treats a `{"test": true}` body as a handshake and
-- starts no dump, so the check costs nothing.
--
-- `security definer` because `cron.job`, `vault.decrypted_secrets` and
-- `net._http_response` are all unreachable by the app's roles. Execute is
-- granted to **`service_role` only** — the same bar as the secrets tables — so a
-- signed-in user cannot call them directly; the admin check is in the service
-- layer, and the app reaches these through its service-role client.

-- What Postgres knows about this target's job, and how its last firing went.
create or replace function public.backup_cron_diagnostics(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, cron, vault, net
as $$
declare
  v_job          text := public.backup_target_job_name(p_target);
  v_row          public.backup_targets;
  v_jobid        bigint;
  v_job_schedule text;
  v_job_active   boolean;
  v_run_status   text;
  v_run_message  text;
  v_run_at       timestamptz;
  v_url          text;
begin
  select * into v_row from public.backup_targets where id = p_target;
  if v_row.id is null then
    raise exception 'Backup target % not found.', p_target;
  end if;

  -- Scalars rather than a `cron.job` rowtype: the extension's columns differ
  -- between versions, and this only needs three of them.
  select jobid, schedule, active
    into v_jobid, v_job_schedule, v_job_active
    from cron.job
   where jobname = v_job;

  if v_jobid is not null then
    select status, return_message, start_time
      into v_run_status, v_run_message, v_run_at
      from cron.job_run_details
     where jobid = v_jobid
     order by start_time desc
     limit 1;
  end if;

  -- The URL, but never the token: a wrong URL is the likeliest cause of a
  -- schedule that never arrives, and seeing it is how you spot `localhost`.
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'backup_cron_url';

  return jsonb_build_object(
    'jobName', v_job,
    'scheduleEnabled', v_row.schedule_enabled,
    'rowSchedule', coalesce(v_row.cron_schedule, ''),
    'jobExists', v_jobid is not null,
    -- What pg_cron will actually act on, which is not necessarily the column:
    -- they drift if a job was created before the row changed.
    'jobSchedule', coalesce(v_job_schedule, ''),
    'jobActive', coalesce(v_job_active, false),
    'cronUrl', coalesce(v_url, ''),
    'hasUrlSecret', coalesce(v_url, '') <> '',
    'hasTokenSecret', exists (
      select 1 from vault.decrypted_secrets
       where name = 'backup_cron_secret' and coalesce(decrypted_secret, '') <> ''
    ),
    'lastRunStatus', coalesce(v_run_status, ''),
    'lastRunMessage', coalesce(v_run_message, ''),
    'lastRunAt', to_jsonb(v_run_at)
  );
end
$$;

-- Sends one request down exactly the path a firing job takes — same URL, same
-- token, same `net.http_post` — carrying `{"test": true}` so the app answers and
-- dumps nothing. Returns pg_net's request id; the response arrives
-- asynchronously and is read by the function below.
create or replace function public.backup_cron_ping()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_url   text;
  v_token text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'backup_cron_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'backup_cron_secret';

  if coalesce(v_url, '') = '' or coalesce(v_token, '') = '' then
    raise exception
      'Set the backup_cron_url and backup_cron_secret Vault secrets first — see docs/backups.md.';
  end if;

  return net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := jsonb_build_object('test', true),
    timeout_milliseconds := 10000
  );
end
$$;

-- Reads one pg_net response. `settled` is false while the request is still in
-- flight — the caller polls until it turns true or gives up.
create or replace function public.backup_cron_ping_result(p_request bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_status    integer;
  v_content   text;
  v_error     text;
  v_timed_out boolean;
  v_settled   boolean := false;
begin
  select status_code, content, error_msg, timed_out, true
    into v_status, v_content, v_error, v_timed_out, v_settled
    from net._http_response
   where id = p_request;

  return jsonb_build_object(
    'settled', coalesce(v_settled, false),
    'status', coalesce(v_status, 0),
    -- Our own route's JSON, and the panel shows one line of it — capped so a
    -- proxy's HTML error page cannot arrive as a wall of markup.
    'body', left(coalesce(v_content, ''), 500),
    'error', coalesce(v_error, ''),
    'timedOut', coalesce(v_timed_out, false)
  );
end
$$;

revoke all on function public.backup_cron_diagnostics(uuid) from public;
revoke all on function public.backup_cron_ping() from public;
revoke all on function public.backup_cron_ping_result(bigint) from public;

grant execute on function public.backup_cron_diagnostics(uuid) to service_role;
grant execute on function public.backup_cron_ping() to service_role;
grant execute on function public.backup_cron_ping_result(bigint) to service_role;
