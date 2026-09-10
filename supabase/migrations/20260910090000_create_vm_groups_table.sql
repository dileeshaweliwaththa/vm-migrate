-- VM groups — one group, many VMs.
--
-- The tracker lists a client's machines as unrelated rows: EUKHOST-STRATEGIZER,
-- EUKHOST-ROCKLAND and EUKHOST-IMA are one client's fleet, and nothing in the
-- schema said so. A group is that missing parent: `vms.group_id` is a plain FK,
-- so a VM belongs to at most one group and a group holds any number of VMs.
--
-- Deliberately NOT a many-to-many join table (the shape `project_tags` uses).
-- A VM sits on exactly one client's account; letting it be in two groups would
-- make "how many VMs does EUKHOST have" ambiguous and the tracker's grouped
-- rendering impossible — a row would have to appear under two headers.
--
-- `on delete set null`: deleting a group ungroups its VMs, it never deletes
-- them. Nothing about a group is VM data, so losing the group must not lose
-- machines.

create table public.vm_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  -- Free text, same as `vms.notes` — who the client is, account references.
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vms
  add column if not exists group_id uuid references public.vm_groups (id) on delete set null;

-- The tracker reads every VM and renders them grouped, and the group header
-- counts its members, so `group_id` is filtered on for every page load.
create index if not exists vms_group_id_idx on public.vms (group_id);

create trigger set_vm_groups_updated_at
  before update on public.vm_groups
  for each row execute function public.set_updated_at();

-- RLS: the standard split from every other table — read = any authenticated
-- user (viewers included), insert/update = editor|admin.
--
-- Delete sits at editor+ rather than admin, following `vm_urls` rather than
-- `vms`: grouping is ordinary editing work, and thanks to `on delete set null`
-- deleting a group destroys nothing but the grouping itself. The admin-only
-- deletes are the ones that lose VM data — purge, clear-trash, replace-all
-- import.
alter table public.vm_groups enable row level security;

create policy "Authenticated users can read vm_groups"
  on public.vm_groups for select
  to authenticated
  using (true);

create policy "Editors and admins can write vm_groups"
  on public.vm_groups for all
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));
