-- The app's GitHub connection: one access token, set by an admin in Settings,
-- used server-side to list repositories and branches for the record source
-- picker (docs/github.md).
--
-- A singleton: `id` is a boolean pinned to `true`, so the table can only ever
-- hold one row and the upsert has a fixed conflict target.
--
-- Same construction as `vm_jenkins_secrets`: RLS **on with no policies**, so no
-- authenticated client can read or write it. Only `githubSecretRepository`
-- reaches it, via the service-role client, behind a role check in
-- `githubService` (admin to write, editor to use). The token never reaches the
-- browser — the Settings page is sent `configured` and the account login only.
--
-- `account_login` is the GitHub user the token belongs to, captured when the
-- token is verified on save. Not secret, but it lives beside the token so the two
-- can't disagree about which account is connected.

create table if not exists public.github_secrets (
  id            boolean primary key default true check (id),
  access_token  text not null default '',
  account_login text not null default '',
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists set_github_secrets_updated_at on public.github_secrets;
create trigger set_github_secrets_updated_at
  before update on public.github_secrets
  for each row execute function public.set_updated_at();

alter table public.github_secrets enable row level security;
