-- #84, step 3 of 3: drop the per-environment Jenkins credentials.
--
-- A VM runs one Jenkins, so the server, user and token belong to the VM
-- (`vm_jenkins` / `vm_jenkins_secrets`). An environment keeps only its job
-- (`environments.jenkins_url`). The per-environment username and the
-- `environment_secrets` token table were a read fallback for environments whose
-- VM had no server; `…_backfill_vm_jenkins_from_environments.sql` gave those VMs
-- one.
--
-- Run it only after the app version that no longer reads these is deployed: the
-- version before it queries `environment_secrets` every time an environment's
-- Jenkins dialog opens, and that query fails once the table is gone.
--
-- **Destructive, and guarded.** `environment_secrets` holds tokens, and for an
-- environment whose VM has no complete server it is the only copy. So this
-- refuses to run while any Jenkins environment with a job sits on a VM without a
-- server, a user and a token. Fix those (run the backfill, or set the VM up in
-- the tracker) and run it again.

do $$
declare
  stranded integer;
begin
  select count(*) into stranded
  from public.environments e
  where e.cicd_provider = 'jenkins'
    and btrim(coalesce(e.jenkins_url, '')) <> ''
    and not exists (
      select 1
      from public.vm_jenkins v
      join public.vm_jenkins_secrets s on s.vm_id = v.vm_id
      where v.vm_id = e.vm_id
        and btrim(v.base_url) <> ''
        and btrim(v.username) <> ''
        and btrim(s.jenkins_api_token) <> ''
    );

  if stranded > 0 then
    raise exception
      '% Jenkins environment(s) have no complete Jenkins server on their VM. Run the backfill migration, or set the VM up in the tracker, before dropping environment_secrets.',
      stranded;
  end if;
end
$$;

alter table public.environments drop column if exists jenkins_username;

drop table if exists public.environment_secrets;
