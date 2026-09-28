-- The source repository a record is built from.
--
-- Every record now says *what* it deploys — a repository and a branch — not just
-- where it answers. `branch` already exists (it identifies a managed-platform
-- record, see …_add_branch_to_environment_ports.sql); this adds the repository
-- beside it, and both are now filled in for every provider.
--
-- Hand-entered for manual/docker records. A record that links a Jenkins job
-- doesn't use this column: its repository and branch are read live from the
-- job's own config.xml, so there is no stored copy to drift from Jenkins
-- (docs/jenkins-sync.md § Repository and branch).
--
-- Free text, not an enum (repository URLs aren't a fixed set). Defaults to '' so
-- existing rows stay valid with no backfill, matching `domain` and `branch`.
-- Credentials embedded in a clone URL (`https://user:token@…`) are stripped by
-- the service before the value is written.

alter table public.endpoints
  add column if not exists repo_url text not null default '';
