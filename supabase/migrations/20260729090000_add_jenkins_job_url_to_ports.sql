-- Phase 2b · M3 · link a port/endpoint record to a specific Jenkins job.
--
-- A row in `environment_ports` can now represent a Jenkins job (added via
-- "Use" from the browse-jobs dialog): the port is filled in later, and the
-- stored job URL powers a per-record "Run build". The URL is not secret, so it
-- lives on the row (the token still lives only in environment_secrets).

alter table public.environment_ports
  add column if not exists jenkins_job_url text not null default '';
