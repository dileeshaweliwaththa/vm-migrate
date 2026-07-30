-- Phase 2 · M4 · a third provenance for records: 'docker'.
--
-- Records can now be imported by pasting `docker ps` output for an environment's
-- host (see docs/docker-import.md), so `port_source` needs a value for rows that
-- came from a container's published port — distinct from 'manual' (typed by hand)
-- and 'jenkins' (from a job).
--
-- `alter type … add value` is transaction-safe on PG12+ *provided the new value
-- isn't used in the same transaction*. This migration only declares it; the first
-- row with source='docker' is written later by the app, so it's safe as-is. Don't
-- add an insert/update using 'docker' to this file.
--
-- The TS constant PORT_SOURCES in types/common/project.ts lists the same values in
-- the same order (AGENTS.md).

alter type public.port_source add value if not exists 'docker';
