-- Which of its VM's addresses an endpoint answers on.
--
-- Until now the tracker built every "Full New URL" from `vms.new_ip`, because a
-- machine had exactly one address to build from. A VM that carries an adopted
-- address (see `vm_ips`) has two, and the endpoints that came with that address
-- answer on it — not on the machine's own.
--
-- **Null means the VM's primary**, which is what every existing row already
-- means, so this is a pure add: no backfill, and no behaviour change on any row
-- that predates it.
--
-- `on delete set null` rather than cascade: removing an address must not delete
-- the endpoints that were on it. They fall back to the primary, which is visible
-- and correctable, instead of silently disappearing.
alter table public.endpoints
  add column if not exists ip_id uuid references public.vm_ips (id) on delete set null;

create index if not exists endpoints_ip_id_idx on public.endpoints (ip_id);

comment on column public.endpoints.ip_id is
  'The vm_ips address this endpoint answers on. Null = the VM''s primary address (vms.new_ip).';
