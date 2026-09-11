-- Backups become admin-write, everyone-read.
--
-- The Backups tab shipped with this project's standard role split: editors and
-- admins write, viewers read. That is the right shape for a tracker row. It is
-- the wrong shape here, because nothing on this tab is merely editing a record:
--
--   * a target holds a credential that can read every database on a server
--   * a dump *is* those databases — every row of every table, in one file
--   * the schedule decides whether any of it happens at all
--
-- So there is one gate instead of two. Reading stays open to every signed-in
-- role: that last night's backup ran is not a privilege, and hiding it from the
-- people who would notice it had stopped is the wrong way round.
--
-- The service layer enforces this too (`requireAdmin` throughout
-- `backupService` and `backupStorageService`). These policies are the floor
-- under it — the one that still holds if a route is added without a check.

-- ---------------------------------------------------------------- targets
drop policy if exists "Editors and admins can write backup_targets" on public.backup_targets;

create policy "Admins can write backup_targets"
  on public.backup_targets for all
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ------------------------------------------------------------- destinations
drop policy if exists "Editors and admins can write backup_storage_accounts"
  on public.backup_storage_accounts;

create policy "Admins can write backup_storage_accounts"
  on public.backup_storage_accounts for all
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- --------------------------------------------------------------- dispatches
-- The record that a run was *asked for*. A scheduled run has no session to check
-- a role against — pg_cron is not a person — so these rows are written with the
-- service-role client, the same as `backup_runs`. That leaves no reason for a
-- client-side insert policy to exist: dropping it means the only way a dispatch
-- row appears is through `runBackup`, which checks the role itself.
drop policy if exists "Editors and admins can insert backup_dispatches"
  on public.backup_dispatches;
