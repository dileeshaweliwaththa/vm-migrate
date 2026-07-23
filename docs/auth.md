# Authentication

Sign-in is **passwordless email OTP** via Supabase Auth: the user requests a
6-digit code, then enters it to sign in. It is a single vertical slice that
touches all five architecture layers (see [architecture.md](./architecture.md)).

## Flow

1. **Request a code.** The user enters their email on `/login`
   (`components/auth/login-page.tsx`). The `useEmailSignUp` hook POSTs to
   `/api/auth/signup`, which calls `emailSignUp` in
   `services/auth/authService.ts` → `signInWithOtp` with
   `shouldCreateUser: true` (`repositories/auth/authRepository.ts`). Supabase
   emails the code. On new accounts the `on_auth_user_created` trigger creates
   the matching `profiles` row (`supabase/migrations/…_create_profiles_table.sql`).
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

## Extending this

Common next steps when building a real app on top of the starter:

- Add a `verify` step/page and route handler if you want OTP-code entry
  instead of magic links (the service already exposes `verifyOtp`).
- Add a route guard in `app/(protected)/...` that redirects unauthenticated
  users away, using `getCurrentUser` from the auth service.
- Add roles/permissions by extending `profiles` with a new column (a new
  `supabase migration new` file) and reading it in the service layer.

## Known limitation

With RLS enabled on `profiles`, the anonymous email-existence check in
`emailSignUp` (`findProfileByEmail`) returns `null` for callers without a
session — so an existing user who hits sign-up simply receives a sign-in
email instead of an "account already exists" message. Fixing this properly
requires the service-role client (`lib/supabase/service.ts`) or an RPC.
