-- Phase 2 · RBAC foundation.
--
-- Adds a global role to every profile (admin | editor | viewer) and the
-- reusable `current_user_role()` helper that later tables' RLS policies use to
-- gate writes. Also lets admins read and update all profiles (needed for the
-- admin user-management flow), on top of the existing "read own profile" rule.

-- 1) Role column. Existing rows default to the least-privileged 'viewer'.
alter table public.profiles
  add column if not exists role text not null default 'viewer'
    check (role in ('admin', 'editor', 'viewer'));

-- 2) Reusable role helper. SECURITY DEFINER so policies can read the caller's
--    role without recursing through profiles' own RLS. `search_path = ''`
--    forces fully-qualified names (Supabase linter requirement).
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 3) Admin access to all profiles (for user management). The original
--    "Users can read own profile" select policy stays in place; policies are
--    OR-combined, so admins additionally get full read/update here.
create policy "Admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.current_user_role() = 'admin');

create policy "Admins can update all profiles"
  on public.profiles
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
