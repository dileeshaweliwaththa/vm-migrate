-- One table for every URL: `endpoints`.
--
-- The app kept the same fact in two places. `vm_urls` held "this VM serves this
-- port at this domain, DNS moved, endpoint tested" for the tracker;
-- `environment_ports` held "this project environment deploys this port at this
-- domain" for the projects page. An environment already points at a VM, so both
-- were describing one thing — an endpoint on a machine — and a URL added from a
-- project was invisible in the tracker.
--
-- This renames `environment_ports` to `endpoints` (it is no longer an
-- environment-only concept), widens it with the tracker's columns, folds
-- `vm_urls` into it, and drops `vm_urls`.
--
-- ## Who owns a row
--
-- Exactly one parent, enforced by a CHECK:
--
--   * `environment_id` set — a project's record. Its VM is *derived* from the
--     environment (`environments.vm_id`), never copied here: move the
--     environment to another host and every one of its endpoints follows, with
--     no second copy to fall out of step.
--   * `vm_id` set — a VM-owned endpoint, added from the tracker for a machine
--     with no project behind it. That is the tracker's original job and it keeps
--     working on its own.
--
-- Never both, never neither. A managed-platform record (Amplify/AWS/Azure) has
-- an environment whose `vm_id` is null, so it simply never appears in the
-- tracker — which is correct: there is no machine.
--
-- ## Column reconciliation
--
--   vm_urls.url   -> endpoints.domain     (one column for "where it answers")
--   vm_urls.proto -> endpoints.protocol   (text -> the net_protocol enum)
--   vm_urls.notes -> endpoints.notes      (new column; `description` is the
--                                          record's *name*, a different field)
--   vm_urls.dns / .tested -> endpoints.dns / .tested (new columns)
--
-- ## Merging the overlap
--
-- Where a tracker URL and a project record describe the same endpoint — same VM,
-- same port, same protocol — they become one row: the project record survives
-- and inherits the tracker's DNS/tested/notes. Pairing is one-to-one (a VM with
-- two rows on port 443 merges one and keeps the other as VM-owned), so nothing
-- is silently collapsed and no note is lost.

-- 1) Rename ------------------------------------------------------------------
alter table public.environment_ports rename to endpoints;

alter index if exists environment_ports_environment_id_idx
  rename to endpoints_environment_id_idx;

-- 2) The tracker's columns ---------------------------------------------------
alter table public.endpoints
  add column if not exists vm_id uuid references public.vms (id) on delete cascade,
  -- `dns`/`tested` are the migration checklist; they were only ever asked about
  -- VM endpoints, and now every endpoint on a VM can answer them.
  add column if not exists dns boolean not null default false,
  add column if not exists tested boolean not null default false,
  add column if not exists notes text not null default '';

-- 3) Exactly one parent ------------------------------------------------------
alter table public.endpoints alter column environment_id drop not null;

alter table public.endpoints
  drop constraint if exists endpoints_one_parent;
alter table public.endpoints
  add constraint endpoints_one_parent
  check (num_nonnulls(environment_id, vm_id) = 1);

-- The tracker reads endpoints by VM on every page load.
create index if not exists endpoints_vm_id_idx on public.endpoints (vm_id);

-- 4) Fold `vm_urls` in -------------------------------------------------------

-- The legacy column is free text, so it is normalized before it can become an
-- enum: blank and anything unrecognized become HTTPS, which is what the tracker
-- already assumed when it created a row.
create temporary table _vm_urls_normalized as
select
  u.id,
  u.vm_id,
  u.port,
  (case upper(coalesce(nullif(trim(u.proto), ''), 'HTTPS'))
     when 'HTTP'  then 'HTTP'
     when 'HTTPS' then 'HTTPS'
     when 'TCP'   then 'TCP'
     when 'UDP'   then 'UDP'
     when 'WS'    then 'WS'
     when 'WSS'   then 'WSS'
     else 'HTTPS'
   end)::public.net_protocol as protocol,
  u.url,
  u.dns,
  u.tested,
  u.notes,
  u.position,
  u.created_at
from public.vm_urls u;

-- One tracker row pairs with at most one project record and vice versa: both
-- ranks must be 1. Ordered by `created_at` so the pairing is deterministic
-- rather than dependent on physical row order.
create temporary table _endpoint_merge_pairs as
with candidates as (
  select
    n.id as url_id,
    e.id as endpoint_id,
    row_number() over (partition by n.id order by e.created_at, e.id) as url_rank,
    row_number() over (partition by e.id order by n.created_at, n.id) as endpoint_rank
  from _vm_urls_normalized n
  join public.environments env on env.vm_id = n.vm_id
  join public.endpoints e
    on e.environment_id = env.id
   and e.port = n.port
   and e.protocol = n.protocol
)
select url_id, endpoint_id
from candidates
where url_rank = 1 and endpoint_rank = 1;

-- The surviving project record inherits the tracker's checklist. `domain` and
-- `description` are left alone — the project's own values win, since that is
-- where they are maintained — and `notes` only fills a blank.
update public.endpoints e
set dns    = n.dns,
    tested = n.tested,
    notes  = case when e.notes = '' then n.notes else e.notes end
from _endpoint_merge_pairs p
join _vm_urls_normalized n on n.id = p.url_id
where e.id = p.endpoint_id;

-- Everything that didn't pair becomes a VM-owned endpoint.
insert into public.endpoints (
  environment_id, vm_id, port, branch, protocol, description, domain,
  source, jenkins_job_url, dns, tested, notes, position, created_at
)
select
  null,
  n.vm_id,
  n.port,
  '',
  n.protocol,
  '',
  n.url,
  'manual'::public.port_source,
  '',
  n.dns,
  n.tested,
  n.notes,
  n.position,
  n.created_at
from _vm_urls_normalized n
where not exists (select 1 from _endpoint_merge_pairs p where p.url_id = n.id);

drop table _endpoint_merge_pairs;
drop table _vm_urls_normalized;

drop table public.vm_urls;

-- 5) RLS ---------------------------------------------------------------------
-- The policies followed the rename; only their names still say
-- `environment_ports`. The rule itself is unchanged and was identical on both
-- source tables: read = any authenticated user (viewers included), and
-- insert/update/delete = editor|admin, because adding or removing a URL row is
-- ordinary editing work in either view.
drop policy if exists "Authenticated users can read environment_ports" on public.endpoints;
drop policy if exists "Editors and admins can write environment_ports" on public.endpoints;

create policy "Authenticated users can read endpoints"
  on public.endpoints for select
  to authenticated
  using (true);

create policy "Editors and admins can write endpoints"
  on public.endpoints for all
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));
