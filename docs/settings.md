# App Settings (admin)

Phase 2 · M2. Global, admin-configured settings live in the **`app_settings`**
singleton table (see [schema.md](./schema.md)). This is the reference example of
an admin-only, secret-holding vertical slice.

## Access

Admin-only end to end (defense-in-depth):

- **RLS** — `app_settings` grants `select`/`insert`/`update` only when
  `current_user_role() = 'admin'`. Viewers and editors cannot read the row at
  all, so a secret can never reach them.
- **Service layer** — every `settingsService` entry point re-checks the caller's
  real session role before touching the repository.
- **UI** — the Settings nav item and `/admin/settings` page are admin-gated
  (the page redirects non-admins to `/dashboard`).

## Layout

One category at a time: a menu down the left (shadcn `Item`s — `ui/tabs` renders
empty on Radix 1.4.3, see [ui-guidelines.md](./ui-guidelines.md)), the chosen
section on the right, stacked on narrow screens. Each section owns its own
buttons — the AI section its **Save**, GitHub its **Connect / Test / Disconnect** —
so there is no page-level Save.

The categories are `SETTINGS_SECTIONS` in
[types/common/settings.ts](../types/common/settings.ts), and the choice is
mirrored into `?section=` (`/admin/settings?section=github`), validated by the
page with `isSettingsSection` and falling back to the first. **To add a
category:** append its key to `SETTINGS_SECTIONS`, then add its entry (title,
description, icon, render) to `SECTIONS` in `settings-manager.tsx` — a
`Record<SettingsSection, …>`, so forgetting the second step is a type error.

## Layers

| Layer      | File                                                        |
| ---------- | ----------------------------------------------------------- |
| Routing    | `app/api/settings/route.ts`, `app/(protected)/(app)/admin/settings/page.tsx` |
| UI         | `components/settings/settings-manager.tsx` (page + section menu, AI section), `components/settings/github-settings.tsx` |
| Hook       | `hooks/settings/useAppSettings.ts`                          |
| Service    | `services/settings/settingsService.ts`                      |
| Repository | `repositories/appSettings/appSettingsRepository.ts`         |

> Jenkins is **not** configured here — it is per-VM. See
> [jenkins-sync.md](./jenkins-sync.md).
>
> The page's **GitHub** section is its own slice with its own buttons and its own
> service-role table (`github_secrets`), not part of `app_settings` — see
> [github.md](./github.md).

## Secrets handling

`gemini_api_key` is a secret and is treated as such:

- **Never returned to the client.** `getSettings` maps the row to a
  secret-free `AppSettings` shape where the secret becomes a boolean
  (`hasGeminiKey`). The API only ever returns that shape.
- **Write-only in the UI.** The key input is blank on load; a blank field means
  "keep the stored value". Only a value the admin actually types is sent
  (`saveSettings` writes the secret column only when its input is defined).
- **Read server-side only.** A non-admin editor running "Generate by AI" needs
  the Gemini key but must not be able to read it. `getGeminiConfig` reads the
  row with the **service-role** client (bypasses RLS) purely to call Gemini; the
  key never leaves the server. See [ai-docs.md](./ai-docs.md).
- **MVP fallback.** If the row's key is empty, `getGeminiConfig` falls back to
  the `GEMINI_API_KEY` server env var (never `NEXT_PUBLIC_`).

Encryption at rest (Supabase Vault / pgcrypto) is a deliberate follow-up; the
MVP relies on admin-only RLS + service-role reads (see phase-2-plan.md §7).
