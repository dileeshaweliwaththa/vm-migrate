-- Phase 2 · M4 · the deployed branch of a record on a managed platform.
--
-- A record on Amplify/AWS/Azure has no host port to record — those platforms
-- deploy a *branch* of a repo behind their own endpoint — so the Port column is
-- hidden there and this takes its place. Port and branch are alternatives per
-- provider, not both at once: a record shows Branch exactly where it has no Port
-- (`providerHasPorts` / `providerHasBranch` in types/common/project.ts, and
-- docs/jenkins-sync.md § Records by provider).
--
-- The column exists for every row regardless of provider, so switching an
-- environment's provider only changes which value is shown — nothing is lost.
--
-- Free text, not an enum: branch names aren't a fixed value set, so the enum rule
-- in AGENTS.md doesn't apply. Defaults to '' so existing rows stay valid with no
-- backfill, matching `domain`.

alter table public.environment_ports
  add column if not exists branch text not null default '';
