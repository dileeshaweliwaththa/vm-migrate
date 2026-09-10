-- Jenkins belongs to the VM, not to each environment.
--
-- A VM runs **one** Jenkins. Until now its address, user and API token were
-- stored per environment (`environments.jenkins_url` / `.jenkins_username` +
-- `environment_secrets`), and a second environment on the same host had to be
-- told the same three things again. `services/jenkins/inheritance.ts` papered
-- over that by borrowing a sibling environment's credentials — useful, but it
-- made "where is this VM's Jenkins configured?" a question with no single
-- answer.
--
-- So the server moves to the machine that runs it:
--
--   * `vm_jenkins`         — one row per VM: server URL + username (not secret)
--   * `vm_jenkins_secrets` — the API token, service-role only
--
-- The environment keeps `jenkins_url`, which from here on means **its job** on
-- that server. Server + credentials come from the VM; the job is what
-- distinguishes two environments sharing one Jenkins.
--
-- Existing configuration is carried over: for every VM, the most recently
-- updated environment that had a Jenkins URL seeds the VM's row, and its token
-- comes along. Nothing is deleted — the per-environment columns stay as a
-- fallback for an environment that has no VM to inherit from, so no setup that
-- works today stops working.

-- 1) The non-secret half ------------------------------------------------------
create table public.vm_jenkins (
  vm_id      uuid primary key references public.vms (id) on delete cascade,
  -- The server root, e.g. `http://20.197.41.68:8080` (a context path is kept:
  -- `http://host/jenkins`). Normalized on write, where a missing port becomes
  -- 8080 — the Jenkins default, and what these servers all use.
  base_url   text not null default '',
  -- The Basic-auth user the token belongs to. A token without its user is
  -- unusable, so the two are set together.
  username   text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_vm_jenkins_updated_at
  before update on public.vm_jenkins
  for each row execute function public.set_updated_at();

-- RLS: the standard split. The URL and username are not secret — the tracker
-- shows which VMs have Jenkins set up to everyone who can see the VM.
alter table public.vm_jenkins enable row level security;

create policy "Authenticated users can read vm_jenkins"
  on public.vm_jenkins for select
  to authenticated
  using (true);

create policy "Editors and admins can write vm_jenkins"
  on public.vm_jenkins for all
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));

-- 2) The secret half ----------------------------------------------------------
-- Same construction as `environment_secrets`: RLS **on with no policies**, so no
-- authenticated client can read or write it. Only server code reaches it, via
-- the service-role client, behind an editor check in the service layer. That is
-- what lets a viewer trigger a build without ever being sent the token.
create table public.vm_jenkins_secrets (
  vm_id            uuid primary key references public.vms (id) on delete cascade,
  jenkins_api_token text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger set_vm_jenkins_secrets_updated_at
  before update on public.vm_jenkins_secrets
  for each row execute function public.set_updated_at();

alter table public.vm_jenkins_secrets enable row level security;

-- 3) Carry existing per-environment configuration onto the VM -----------------

-- One donor environment per VM: it must have a URL to derive a server from, and
-- the most recently updated one wins so a rotated token is what moves, not the
-- oldest.
create temporary table _vm_jenkins_seed as
select distinct on (e.vm_id)
  e.vm_id,
  -- Server root: everything before `/job/`, which keeps a context path
  -- (`http://host/jenkins/job/x` -> `http://host/jenkins`) and leaves a URL that
  -- is already a bare server alone.
  regexp_replace(
    case
      when position('/job/' in e.jenkins_url) > 0
        then left(e.jenkins_url, position('/job/' in e.jenkins_url) - 1)
      else e.jenkins_url
    end,
    '/+$', ''
  ) as base_url,
  coalesce(e.jenkins_username, '') as username,
  coalesce(s.jenkins_api_token, '') as jenkins_api_token
from public.environments e
left join public.environment_secrets s on s.environment_id = e.id
where e.vm_id is not null
  and coalesce(e.jenkins_url, '') <> ''
order by e.vm_id, e.updated_at desc, e.id;

insert into public.vm_jenkins (vm_id, base_url, username)
select vm_id, base_url, username from _vm_jenkins_seed
on conflict (vm_id) do nothing;

insert into public.vm_jenkins_secrets (vm_id, jenkins_api_token)
select vm_id, jenkins_api_token
from _vm_jenkins_seed
where jenkins_api_token <> ''
on conflict (vm_id) do nothing;

drop table _vm_jenkins_seed;
