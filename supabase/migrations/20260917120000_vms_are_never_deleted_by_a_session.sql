-- The tracker's trash is an **archive**, not a staging area for deletion.
--
-- A VM row is the only record that a machine ever existed: what it was called,
-- what it answered on, what was migrated onto it, and which endpoints it served.
-- Trashing it already removes it from the grid, which is the whole of what
-- "deleted" needs to mean day to day. Permanently destroying it is a different
-- act entirely, and until now it was two clicks away from the row itself —
-- "Delete" on a trashed VM, or "Clear all" on a whole trash list — with a
-- `confirm()` as the only thing between a misread row and an unrecoverable loss.
--
-- So no signed-in session may delete a `vms` row any more, **admins included**.
-- The app's purge and clear-trash paths are gone with this policy; what remains
-- is Restore.
--
-- Deleting a VM for real is now a database-level act: the Supabase SQL editor or
-- the service-role key, both of which bypass RLS. That is deliberate — it is a
-- deliberate, audited thing to do, performed where you can see exactly what you
-- are about to destroy, not a red button beside a row in a list.
--
-- **One exception remains inside the app**: the admin-only replace-all import
-- (restore-from-backup) has to clear the table before it can put a backup back,
-- and it does that with the service-role client behind `requireAdmin` — see
-- `deleteAllVmsForImport` in repositories/vms/vmRepository.ts and the audit table
-- in docs/security.md.
--
-- Nothing else changes: insert and update stay editor|admin, select stays open to
-- every authenticated user, and `endpoints`/`vm_ips` keep their own policies (a
-- cascade from a service-role delete is not subject to RLS on the referencing
-- table anyway).
drop policy if exists "Admins can delete vms" on public.vms;

comment on table public.vms is
  'Virtual machines tracked through migration. Soft-deleted via `deleted`/`deleted_at` (the tracker trash). There is no delete policy: no authenticated session can destroy a row — that is a service-role/SQL-editor act.';
