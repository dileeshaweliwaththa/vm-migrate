-- A backup target names its database engine.
--
-- The feature was built for one Azure MySQL server, so "which engine" was not a
-- question anything asked: the runner spawned `mysqldump` and that was the only
-- shape a target could have. Backing up the self-hosted **Supabase Postgres**
-- needs the same four things (host, port, user, password), the same destination,
-- the same schedule and the same retention — the only difference is which client
-- binary performs the dump and how it is asked for the database list.
--
-- So this is one column, not a second table. Everything else about a target is
-- already engine-neutral.
--
-- An enum rather than `text` + a check, per the project's conventions: the set is
-- fixed, and `BACKUP_ENGINES` in types/common/backup.ts lists the same values in
-- the same order.
do $$
begin
  create type public.backup_engine as enum ('mysql', 'postgres');
exception
  when duplicate_object then null;
end
$$;

-- `default 'mysql'` so every existing row keeps doing exactly what it did. The
-- column is not null because "unknown engine" is not a state the runner could act
-- on — it would have no binary to spawn.
alter table public.backup_targets
  add column if not exists engine public.backup_engine not null default 'mysql';

comment on column public.backup_targets.engine is
  'Which client performs the dump: mysqldump/mysql, or pg_dump/pg_dumpall/psql.';
