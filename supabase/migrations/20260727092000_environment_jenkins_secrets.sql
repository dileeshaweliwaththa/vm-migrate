-- Phase 2b · M3 · per-environment Jenkins configuration.
--
-- Jenkins is configured per environment, not globally. The connection splits by
-- sensitivity:
--   • non-secret parts (job URL, username) live on `environments` — that table
--     is readable by every authenticated user, which is fine for a URL/username;
--   • the secret API token lives in `environment_secrets`, which has RLS enabled
--     with NO policies, so no authenticated client can read or write it. Only the
--     service-role client (server-side, bypasses RLS) touches it — the token is
--     never sent to the browser. See docs/jenkins-sync.md and AGENTS.md §6.

-- Non-secret username for Basic auth (the job URL already exists as jenkins_url).
alter table public.environments
  add column if not exists jenkins_username text not null default '';

create table public.environment_secrets (
  environment_id    uuid primary key references public.environments (id) on delete cascade,
  jenkins_api_token text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.environment_secrets
  for each row execute function public.set_updated_at();

-- RLS on, but intentionally NO policies: authenticated users get no access at
-- all. The token is only ever read/written by server routes via the service-role
-- client, so it cannot leak to any client (viewer, editor, or admin).
alter table public.environment_secrets enable row level security;
