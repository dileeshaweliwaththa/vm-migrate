-- VM addresses — one machine, several public IPs.
--
-- `vms` has exactly two address slots, `old_ip` and `new_ip`, which together say
-- "the machine moved from A to B". That covers a migration where the workload
-- moves. It cannot express the other thing that happens: the machine is
-- decommissioned and its **public IP is detached and reattached** to another
-- machine, so the endpoints keep resolving exactly where they always did and no
-- DNS record is touched. The destination then answers on two addresses.
--
-- The tracker had to record that as a lie — a source VM with `old_ip -> new_ip`
-- claiming its URLs were repointed, when they were not.
--
-- This table is the missing child: an address belongs to a machine, a machine has
-- any number of them. Only the **additional** ones live here. `vms.new_ip` stays
-- the primary address, so every existing read path keeps working unchanged and
-- there is no mirrored column to keep in step with a trigger. A single-address VM
-- has no row here at all and behaves exactly as it did before.
--
-- Deliberately not many-to-many: a public IP answers on exactly one NIC at a
-- time, and letting one address belong to two machines would make "which box
-- serves this URL" unanswerable. Same reasoning as `vm_groups`.

-- How the address got here. An enum rather than `text` + a check, per AGENTS.md
-- § Types, enums & constants — `VM_IP_ORIGINS` in types/common/vm.ts lists the
-- same values in the same order.
--
-- This is not the same question as "is `source_vm_id` set": an address moved off
-- a machine that was never tracked here is still `moved`, and a second address we
-- simply allocated to a live machine is `assigned`.
do $$
begin
  create type public.vm_ip_origin as enum ('assigned', 'moved');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.vm_ips (
  id             uuid primary key default gen_random_uuid(),
  -- Cascade: an address is part of the machine, not a thing that outlives it.
  vm_id          uuid not null references public.vms (id) on delete cascade,
  address        text not null,
  -- Free text — "Dating App IP". What this address was for, when the machine's
  -- own name no longer says it.
  label          text not null default '',
  origin         public.vm_ip_origin not null default 'assigned',
  -- Where it came from. `on delete set null` keeps the FK honest when the source
  -- VM is purged...
  source_vm_id   uuid references public.vms (id) on delete set null,
  -- ...and this snapshot is why the provenance survives that purge. Without it
  -- the history would degrade to "from (deleted)" exactly when the source row is
  -- gone, which is when this is the only record of it left.
  source_vm_name text not null default '',
  moved_at       date,
  position       integer not null default 0,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One machine cannot hold the same address twice. Deliberately not unique on
-- `address` alone: the same string legitimately appears as some other VM's
-- historical `old_ip`.
create unique index if not exists vm_ips_vm_address_key on public.vm_ips (vm_id, address);

-- Every tracker load reads these by VM, and `migratedSources` now reads them by
-- source as well.
create index if not exists vm_ips_vm_id_idx on public.vm_ips (vm_id);
create index if not exists vm_ips_source_vm_id_idx on public.vm_ips (source_vm_id);

create trigger set_vm_ips_updated_at
  before update on public.vm_ips
  for each row execute function public.set_updated_at();

-- RLS: the standard split. Read = any authenticated user (viewers included —
-- which addresses a machine answers on is tracker data, not a secret),
-- insert/update/delete = editor|admin.
--
-- Delete sits at editor+ rather than admin, following `vm_groups` and `endpoints`
-- rather than `vms`: removing an address loses a piece of configuration, not a
-- machine, and its endpoints fall back to the VM's primary rather than being
-- destroyed (see the `on delete set null` on `endpoints.ip_id`).
alter table public.vm_ips enable row level security;

create policy "Authenticated users can read vm_ips"
  on public.vm_ips for select
  to authenticated
  using (true);

create policy "Editors and admins can write vm_ips"
  on public.vm_ips for all
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));

comment on table public.vm_ips is
  'Additional public addresses a VM answers on, beyond vms.new_ip. An address with origin=moved was reattached from source_vm_id when that machine was retired.';
