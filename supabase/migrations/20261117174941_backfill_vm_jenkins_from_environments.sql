-- #84, step 1 of 3: give every VM whose environments still carry their own
-- Jenkins credentials a server of its own, so nothing depends on the
-- per-environment copy any more.
--
-- `…_vm_jenkins_credentials.sql` seeded `vm_jenkins` from the environments once.
-- Environments set up after that, on a VM with no server yet, were configured
-- the old way (`environments.jenkins_username` + `environment_secrets`), so
-- their VM never got one. In November 2026 that was two VMs and four
-- environments: CLIENT-SERVER-2 (Lawbook PRODUCTION, KUMKUM DEV, KUMKUM
-- PRODUCTION) and STTK-GODADDY (STTK PRODUCTION).
--
-- **Additive only.** It inserts a `vm_jenkins` / `vm_jenkins_secrets` row for a
-- VM that has none, and changes nothing else, so it is safe to run with the code
-- that is deployed today: the VM's config already takes precedence there.
--
-- Deploy order for #84:
--   1. this migration;
--   2. the app version that stops reading the per-environment credentials;
--   3. `…_drop_environment_jenkins_credentials.sql`, which refuses to run if any
--      Jenkins environment is still left without a complete server on its VM.

with donor as (
  -- One environment per VM: the most recently updated one with a job, a user and
  -- a token, the same choice the original seed made.
  select distinct on (e.vm_id)
    e.vm_id,
    -- The server root: everything before `/job/`, keeping a context path, with
    -- trailing slashes removed. The same derivation as the original seed and as
    -- `deriveJenkinsBase` in lib/jenkins-url.ts, so the stored root is exactly
    -- the one these environments resolve to today.
    regexp_replace(
      case
        when position('/job/' in e.jenkins_url) > 0
          then left(e.jenkins_url, position('/job/' in e.jenkins_url) - 1)
        else e.jenkins_url
      end,
      '/+$', ''
    ) as base_url,
    btrim(e.jenkins_username) as username,
    btrim(s.jenkins_api_token) as jenkins_api_token
  from public.environments e
  join public.environment_secrets s on s.environment_id = e.id
  where e.vm_id is not null
    and btrim(coalesce(e.jenkins_url, '')) <> ''
    and btrim(coalesce(e.jenkins_username, '')) <> ''
    and btrim(coalesce(s.jenkins_api_token, '')) <> ''
    and not exists (select 1 from public.vm_jenkins v where v.vm_id = e.vm_id)
  order by e.vm_id, e.updated_at desc, e.id
),
servers as (
  insert into public.vm_jenkins (vm_id, base_url, username)
  select vm_id, base_url, username from donor
  on conflict (vm_id) do nothing
  returning vm_id
)
-- The token goes only to a VM whose server row this migration just created, so
-- a user and a token from two different environments are never paired.
insert into public.vm_jenkins_secrets (vm_id, jenkins_api_token)
select d.vm_id, d.jenkins_api_token
from donor d
join servers using (vm_id)
on conflict (vm_id) do nothing;
