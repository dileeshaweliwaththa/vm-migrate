-- Phase 2 · constrain environment names to a fixed set: DEV / STAGE /
-- PRODUCTION. Mirrors the TS ENVIRONMENT_NAMES constant.

do $$ begin
  create type public.environment_name as enum ('DEV', 'STAGE', 'PRODUCTION');
exception when duplicate_object then null; end $$;

-- Normalize any existing free-text names (incl. the '' default) to the three
-- canonical values before the type conversion, so the USING cast can't fail.
update public.environments set name = case
  when upper(name) in ('STAGE', 'STAGING', 'STG') then 'STAGE'
  when upper(name) in ('PROD', 'PRODUCTION', 'PRD', 'LIVE') then 'PRODUCTION'
  else 'DEV'
end;

alter table public.environments alter column name drop default;
alter table public.environments
  alter column name type public.environment_name using name::public.environment_name;
alter table public.environments alter column name set default 'DEV';
