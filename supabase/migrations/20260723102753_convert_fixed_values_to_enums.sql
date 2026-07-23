-- Phase 2 · best practice: model fixed-value columns as Postgres enums instead
-- of `text` + CHECK constraints. Single source of truth, mirrored by the TS
-- constants (USER_ROLES, CICD_PROVIDERS, PROTOCOLS, PORT_SOURCES).
--
-- Conversion per column: drop the default, drop the old CHECK, ALTER TYPE via a
-- USING cast, then restore the default. Enum creation is guarded so the
-- migration is safe to re-run.

-- 1) Enum types -------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('viewer', 'editor', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cicd_provider as enum ('jenkins', 'aws', 'azure', 'amplify', 'other', 'none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.net_protocol as enum ('HTTP', 'HTTPS', 'TCP', 'UDP', 'WS', 'WSS');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.port_source as enum ('manual', 'jenkins');
exception when duplicate_object then null; end $$;

-- 2) profiles.role ----------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles alter column role drop default;
alter table public.profiles
  alter column role type public.user_role using role::public.user_role;
alter table public.profiles alter column role set default 'viewer';

-- current_user_role() now reads an enum column; keep returning text so the
-- existing RLS policies (which compare to text literals) are unaffected.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role::text from public.profiles where id = auth.uid();
$$;

-- 3) projects.cicd_provider + environments.cicd_provider --------------------
alter table public.projects drop constraint if exists projects_cicd_provider_check;
alter table public.projects alter column cicd_provider drop default;
alter table public.projects
  alter column cicd_provider type public.cicd_provider using cicd_provider::public.cicd_provider;
alter table public.projects alter column cicd_provider set default 'none';

alter table public.environments drop constraint if exists environments_cicd_provider_check;
alter table public.environments alter column cicd_provider drop default;
alter table public.environments
  alter column cicd_provider type public.cicd_provider using cicd_provider::public.cicd_provider;
alter table public.environments alter column cicd_provider set default 'none';

-- 4) environment_ports.protocol + .source ----------------------------------
alter table public.environment_ports drop constraint if exists environment_ports_protocol_check;
alter table public.environment_ports alter column protocol drop default;
alter table public.environment_ports
  alter column protocol type public.net_protocol using protocol::public.net_protocol;
alter table public.environment_ports alter column protocol set default 'HTTPS';

alter table public.environment_ports drop constraint if exists environment_ports_source_check;
alter table public.environment_ports alter column source drop default;
alter table public.environment_ports
  alter column source type public.port_source using source::public.port_source;
alter table public.environment_ports alter column source set default 'manual';
