# Layered Architecture

Every feature in this codebase follows a strict 5-layer model. No layer may
skip a layer below it. This keeps business logic testable, keeps the UI
dumb and reusable, and keeps all database access in one predictable place.

```
┌─────────────────────────────────────────────────────────────────┐
│  ROUTING LAYER   app/(auth)/...  app/(protected)/...  app/api/... │
│  Next.js pages, layouts, and route handlers.                     │
│  No business logic. No direct DB access.                         │
├─────────────────────────────────────────────────────────────────┤
│  UI LAYER        components/...                                   │
│  Pure presentational components. No service/repo imports.        │
│  Receives all data as props. Fires callback props for actions.   │
├─────────────────────────────────────────────────────────────────┤
│  HOOK LAYER      hooks/...                                        │
│  Bridges UI to the API/service layer. Owns React state,          │
│  loading, and errors. Uses TanStack Query (useQuery/useMutation).│
│  Calls services (or the app's own API routes) — never repos.     │
├─────────────────────────────────────────────────────────────────┤
│  SERVICE LAYER   services/...                                     │
│  Business logic and use-case orchestration.                      │
│  May call multiple repositories. Transforms raw DB rows into     │
│  domain types. Has no React dependency.                          │
├─────────────────────────────────────────────────────────────────┤
│  REPOSITORY LAYER  repositories/...                               │
│  Pure data access. Supabase queries/auth calls only.             │
│  Returns raw results. Zero business logic. One file per entity.  │
└─────────────────────────────────────────────────────────────────┘
```

## How the layers connect

The included email sign-up flow is the reference example that touches every
layer end to end:

| Layer       | File                                             | Responsibility                                        |
| ----------- | ------------------------------------------------ | ----------------------------------------------------- |
| Routing     | `app/(auth)/login/page.tsx`, `app/api/auth/signup/route.ts` | Renders the page; the route handler receives the POST |
| UI          | `components/auth/login-page.tsx`                 | Form markup, calls the hook, shows the result message |
| Hook        | `hooks/auth/useEmailSignUp.ts`                   | `useMutation` that POSTs to `/api/auth/signup`        |
| Service     | `services/auth/authService.ts`                   | `emailSignUp` — validation + orchestration            |
| Repository  | `repositories/auth/authRepository.ts`, `repositories/profiles/profileRepository.ts` | Supabase auth + `profiles` queries |

## Folder structure

```
app/                                  ← Routing layer
  (auth)/login/page.tsx
  (protected)/dashboard/page.tsx
  api/auth/signup/route.ts

components/                           ← UI layer (pure, no logic)
  auth/login-page.tsx
  ui/                                 ← shadcn primitives (see ui-guidelines.md)
  providers/query-provider.tsx        ← TanStack QueryClientProvider

hooks/                                ← Hook layer (TanStack Query wrappers)
  auth/useEmailSignUp.ts

services/                             ← Service layer (business logic, no React)
  auth/authService.ts

repositories/                         ← Repository layer (Supabase only)
  auth/authRepository.ts
  profiles/profileRepository.ts

types/                                ← Shared domain + response types
  common/
  supabase/

lib/
  env.ts                              ← validated environment variables
  query-client.ts                     ← TanStack QueryClient config
  utils.ts                            ← cn() helper
  supabase/
    client.ts                         ← browser client
    server.ts                         ← server client (cookie session)
    service.ts                        ← service-role client (no session; bypasses RLS)
    proxy.ts                          ← session refresh for the proxy (middleware)

supabase/migrations/                  ← Supabase CLI migrations (see schema.md)
```

## Rules of thumb

- Pages and route handlers (`app/...`) call hooks or services, never
  repositories directly.
- Components never import from `services/` or `repositories/` — data flows in
  through the hook layer as props.
- Hooks call the app's API routes or services, never `repositories/` directly.
- Services own all business rules (validation, orchestration, transforming
  raw rows into domain types) and may call multiple repositories.
- Repositories only talk to Supabase. No conditionals around business rules —
  just queries and raw result shapes.
- The repository layer picks the right Supabase client: `server.ts` for
  request-scoped (cookie session) access, `service.ts` only for the rare
  route with no session (bypasses RLS — see `lib/supabase/service.ts`).

## Errors and "not found"

A failure is caught as close to where it happened as possible, so the rest of
the app keeps working:

| What fails | Caught by | What the reader sees |
| --- | --- | --- |
| A risky panel: the docs viewer and editor | `SectionBoundary` (`components/errors/`) | A small message in place of the panel, with **Try again** |
| A risky dialog: the three Jenkins dialogs | `DialogBoundary`, wrapped **at the call site** | The error in a dialog; closing it closes the original |
| Any signed-in page | `app/(protected)/(app)/error.tsx` | The message inside the shell, sidebar still there, with **Try again** |
| The root layout itself | `app/global-error.tsx` | A standalone page with its own `<html>` |
| A `[id]` page whose row doesn't exist | the page calls `notFound()` → `app/(protected)/(app)/not-found.tsx` | An in-shell 404 |
| A URL matching no route | `app/not-found.tsx` | A plain 404 |

All of them render `ErrorState` (`components/errors/error-state.tsx`), and none
shows a server error's message, which production replaces anyway. They show the
`digest`, which matches the server log.

The boundaries come from Next's `unstable_catchError`. One catches errors from
the components **below** it, not from the component whose JSX it sits in. That's
why the Jenkins dialogs are wrapped where they're mounted: they map their rows
inline.

**A detail page checks its row before rendering.** `projects/[id]`, `vms/[id]`
and `backups/[id]` call `projectExists` / `vmExists` / `backupTargetExists` and
`notFound()` on a miss. Those services, and the getters behind each page's API,
reject an id that isn't a uuid (`isUuid`, `lib/ids.ts`) before asking Postgres,
whose `uuid` columns would fail the query with a database error rather than
return no row.

## Tests

**Vitest**, configured in `vitest.config.mts`, run with `npm test`. Tests cover
the logic that takes plain values and returns plain values: the rules in
`services/` and the helpers in `lib/`. That's where a wrong answer is easy to
miss and cheap to pin down. They run in plain Node and never reach Supabase,
Azure or Jenkins, so a rule that sits next to I/O is written as its own pure
function and tested there. `services/backups/backupOwnership.ts` is the example:
the backup runner and the history both call it, and its tests pin down which
dumps retention may delete.

A test sits next to the file it covers, as `<name>.test.ts`. Pages and
components aren't unit-tested; `npm run build`, `npm run lint` and a look in the
browser cover them.

## Definition of done

After any code change, run `npm run build` and confirm it completes with zero
TypeScript errors, then run `npm test` and `npm run lint` and fix any issues.
