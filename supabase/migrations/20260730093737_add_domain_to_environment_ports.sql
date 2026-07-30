-- Phase 2 · M4 · the domain name a record is served on.
--
-- A record row already carries the port and (for Jenkins-linked records) the
-- job, but nothing recorded *where* it is reachable. `domain` holds the assigned
-- domain/host for the record — e.g. `dev.imaui.upview.tech` — which is what
-- people actually look up when they ask where an environment lives.
--
-- Free text, not an enum: domains aren't a fixed value set, so the enum rule in
-- AGENTS.md doesn't apply. Defaults to '' so existing rows stay valid with no
-- backfill.

alter table public.environment_ports
  add column if not exists domain text not null default '';
