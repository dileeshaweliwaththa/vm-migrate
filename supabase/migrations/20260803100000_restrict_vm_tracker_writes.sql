-- Bring the VM tracker under RBAC.
--
-- `vms` and `vm_urls` shipped in Phase 1, before roles existed, with policies
-- that granted **every authenticated user** full read/write. That left a viewer
-- able to edit and permanently purge VMs while being unable to so much as rename
-- a project, so the tracker is now aligned with every other Phase 2 table:
--
--   select            → any authenticated user (viewers included: read-only)
--   insert / update    → editor | admin
--   delete             → admin, on `vms` only
--
-- `vm_urls` allows delete at editor+ rather than admin: removing a URL row is
-- ordinary editing work, and its VM-level counterpart (trash) is an update, so
-- an editor can already do it. `admin` is reserved for the destructive
-- VM-level operations — purge, clear-trash, and replace-all import.
--
-- A purge cascades to `vm_urls` via the FK; cascade deletes are not subject to
-- RLS on the referencing table, so the narrower `vm_urls` delete policy does not
-- block an admin purge.

-- 1) vms ---------------------------------------------------------------------
drop policy if exists "Authenticated users can read vms" on public.vms;
drop policy if exists "Authenticated users can insert vms" on public.vms;
drop policy if exists "Authenticated users can update vms" on public.vms;
drop policy if exists "Authenticated users can delete vms" on public.vms;

create policy "Authenticated users can read vms"
  on public.vms for select
  to authenticated
  using (true);

create policy "Editors and admins can insert vms"
  on public.vms for insert
  to authenticated
  with check (public.current_user_role() in ('editor', 'admin'));

create policy "Editors and admins can update vms"
  on public.vms for update
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));

create policy "Admins can delete vms"
  on public.vms for delete
  to authenticated
  using (public.current_user_role() = 'admin');

-- 2) vm_urls -----------------------------------------------------------------
drop policy if exists "Authenticated users can read vm_urls" on public.vm_urls;
drop policy if exists "Authenticated users can insert vm_urls" on public.vm_urls;
drop policy if exists "Authenticated users can update vm_urls" on public.vm_urls;
drop policy if exists "Authenticated users can delete vm_urls" on public.vm_urls;

create policy "Authenticated users can read vm_urls"
  on public.vm_urls for select
  to authenticated
  using (true);

create policy "Editors and admins can write vm_urls"
  on public.vm_urls for all
  to authenticated
  using (public.current_user_role() in ('editor', 'admin'))
  with check (public.current_user_role() in ('editor', 'admin'));
