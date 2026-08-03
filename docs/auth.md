# Authentication

Sign-in is **passwordless email OTP** via Supabase Auth: the user requests a
6-digit code, then enters it to sign in. It is a single vertical slice that
touches all five architecture layers (see [architecture.md](./architecture.md)).

## Flow

1. **Request a code.** The user enters their email on `/login`
   (`components/auth/login-page.tsx`). The `useEmailSignUp` hook POSTs to
   `/api/auth/signup`, which calls `emailSignUp` in
   `services/auth/authService.ts` → `signInWithOtp` with
   `shouldCreateUser: false` (`repositories/auth/authRepository.ts`). Supabase
   emails the code. **There is no self-signup:** only an account an admin has
   already provisioned (`/admin/users` → `provisionUser`) can receive one, and
   `on_auth_user_created` creates the matching `profiles` row at that point
   (`supabase/migrations/…_create_profiles_table.sql`).

   The response is the same whether or not the address is registered ("If your
   email is registered, a 6-digit sign-in code is on its way."), so the endpoint
   can't be used to enumerate accounts.
2. **Enter the code.** The login page switches to a code input; the
   `useVerifyOtp` hook POSTs to `/api/auth/verify`, which calls `verifyOtp`
   (`repositories/auth/authRepository.ts` → `verifyOtp` with `type: 'email'`).
   Because this runs on the **server** Supabase client, the session cookies are
   set on the response — the user is signed in and the page redirects to
   `/tracker`.

> **Email template:** the emailed message must contain the code. In Supabase →
> Authentication → Email Templates → **Magic Link**, ensure the body includes
> `{{ .Token }}` (the default template only shows the magic-link URL).

| Layer      | Files                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Routing    | `app/(auth)/login/page.tsx`, `app/api/auth/signup/route.ts`, `app/api/auth/verify/route.ts` |
| UI         | `components/auth/login-page.tsx`                                       |
| Hook       | `hooks/auth/useEmailSignUp.ts`, `hooks/auth/useVerifyOtp.ts`          |
| Service    | `services/auth/authService.ts` — `emailSignUp`, `verifyOtp`, `logout` |
| Repository | `repositories/auth/authRepository.ts`, `repositories/profiles/profileRepository.ts` |

## Session handling

- `lib/supabase/proxy.ts` (`updateSession`) refreshes the auth session on
  each request; it is wired up in `proxy.ts` at the project root (the Next.js
  proxy/middleware entry). The auth cookie is named `app-session` —
  keep the name consistent across `client.ts`, `server.ts`, and `proxy.ts`.
- `lib/supabase/session.ts` exposes `getUserEmail()` as a small server-side
  helper example.

## Where access is enforced

Three layers, each of which must hold on its own:

1. **Page guard.** `app/(protected)/layout.tsx` calls `getCurrentUser()` and
   redirects to `/login`. That is `supabase.auth.getUser()`, which validates the
   token with Supabase — not a cookie-presence check. The root proxy
   (`proxy.ts`) only *refreshes* the session; it guards nothing, so never rely on
   it for access control.
2. **Route handler.** Every handler under `app/api/` re-checks
   `getCurrentUser()` and returns 401 itself. Handlers are not covered by the
   layout guard.
3. **Role + RLS.** Role checks live in the **service** layer (`getCurrentRole`
   / `getCurrentActor` + the `lib/rbac.ts` helpers), and Postgres RLS enforces
   the same rules independently. Services whose tables are fully covered by
   role-based RLS (environments, ports, docs, tags) may lean on RLS alone.

**Service-role paths bypass RLS**, so for those the service-layer check is the
*only* enforcement and must be treated as load-bearing:
`userRepository` (all of it), `appSettingsRepository.findAppSettingsServiceRole`,
and `environmentSecretRepository`. Each is reached only through a service that
calls `requireAdmin()` or a `canEdit`/`canRunBuild` gate first — keep it that
way when adding to them.

Two deliberate asymmetries worth knowing:

- `vms` / `vm_urls` grant **write access to every signed-in role**, viewers
  included (see [schema.md](./schema.md#vms)) — the tracker predates RBAC and is
  intentionally shared. Neither the routes nor the tracker UI gate on role.
- Triggering a Jenkins build is open to viewers by design; each run is attributed
  in `environment_build_runs`. Changing Jenkins *configuration* is editor+.
  Anything built from a client-supplied Jenkins URL goes through
  `isSameJenkinsServer` first, because those requests carry the environment's
  API token.

## Extending this

- Add roles/permissions by extending `profiles` with a new column (a new
  `supabase migration new` file) and reading it in the service layer.
- New API routes: copy the `getCurrentUser()` → 401 preamble, and put the role
  check in the service, not the handler.
