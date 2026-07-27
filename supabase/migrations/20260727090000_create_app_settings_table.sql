-- Phase 2 · M2 · the `app_settings` singleton table.
--
-- One global row (enforced by `id boolean primary key default true check (id)`)
-- holding admin-configured values: the Gemini AI key/model/house-style prompt.
-- The secret (`gemini_api_key`) lives here behind admin-only RLS and is read
-- server-side only — never returned to the browser (the settings service masks
-- it; the AI route reads it via the service-role client). See phase-2-plan.md
-- §3.6 and §7. (Jenkins is configured per-environment, not here — see the
-- environment_secrets migration.)

create table public.app_settings (
  id               boolean primary key default true check (id),
  gemini_api_key   text not null default '',
  gemini_model     text not null default 'gemini-2.5-flash',
  ai_style_prompt  text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Seed the single row so the admin UI always has a row to update.
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- RLS: admin-only for everything. No viewer/editor access at all — the key
-- never travels to a non-admin, and server routes that need the secret use the
-- service-role client (which bypasses RLS).
alter table public.app_settings enable row level security;

create policy "Admins can read app_settings"
  on public.app_settings for select
  to authenticated
  using (public.current_user_role() = 'admin');

create policy "Admins can insert app_settings"
  on public.app_settings for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

create policy "Admins can update app_settings"
  on public.app_settings for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
