-- VM Migration Tracker: the `vm_urls` table.
--
-- Each row is one endpoint (port + protocol + domain) that lives on a VM. A
-- VM has zero-to-many URLs; deleting a VM cascades to its URLs. Rows are shared
-- across all authenticated users, matching the `vms` table.

create table public.vm_urls (
  id         uuid primary key default gen_random_uuid(),
  vm_id      uuid not null references public.vms (id) on delete cascade,
  port       text not null default '',
  proto      text not null default 'HTTPS',
  url        text not null default '',
  dns        boolean not null default false,
  tested     boolean not null default false,
  notes      text not null default '',
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vm_urls_vm_id_idx on public.vm_urls (vm_id);

create trigger set_updated_at
  before update on public.vm_urls
  for each row execute function public.set_updated_at();

-- RLS: shared team tool — any authenticated user has full access.
alter table public.vm_urls enable row level security;

create policy "Authenticated users can read vm_urls"
  on public.vm_urls for select
  to authenticated
  using (true);

create policy "Authenticated users can insert vm_urls"
  on public.vm_urls for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update vm_urls"
  on public.vm_urls for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete vm_urls"
  on public.vm_urls for delete
  to authenticated
  using (true);
