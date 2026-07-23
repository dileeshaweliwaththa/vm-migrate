-- Creates the `profiles` table, keyed by auth.users.id (uuid), which RLS
-- (id = auth.uid()) and the new-user trigger both require.
--
-- One row per auth.users entry. Extend this table (or add new numbered
-- scripts) with the columns your app needs.

-- 1) profiles, keyed by the auth user's uuid.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  created_at timestamptz not null default now()
);

-- 2) RLS: authenticated users can read their own profile.
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- 3) Auto-create a profiles row for every new auth user. The sign-up name
--    travels as OTP metadata (options.data.name -> raw_user_meta_data) and is
--    copied into profiles.name here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 4) Backfill profiles for users that already exist in auth.users.
insert into public.profiles (id, email, name)
select id, email, raw_user_meta_data ->> 'name'
from auth.users
on conflict (id) do nothing;
