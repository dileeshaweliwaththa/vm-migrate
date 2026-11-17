# Project structure guide

A quick "where does this go?" map. The authoritative rules live in
[architecture.md](./architecture.md) (the 5-layer model) and
[ui-guidelines.md](./ui-guidelines.md) (shadcn/ui).

## Core folders

- `app/` — **routing layer**: route-based pages, layouts, and API route
  handlers. No business logic, no direct DB access.
- `components/` — **UI layer**: `ui/` holds shadcn primitives; feature
  folders (`auth/`, …) compose them. `providers/` holds app-wide context
  providers, `layout/` the sidebar and page chrome, and `errors/` the shared
  error and not-found UI with its boundaries
  ([architecture.md § Errors](./architecture.md#errors-and-not-found)).
- `hooks/` — **hook layer**: TanStack Query wrappers bridging UI to services.
- `services/` — **service layer**: business logic and orchestration, no React.
- `repositories/` — **repository layer**: Supabase queries only, one file per
  entity.
- `lib/` — cross-cutting utilities and integrations (env, query client,
  Supabase clients, `cn()`, the role helpers, URL and id rules).
- `types/` — shared domain types (`common/`) and raw Supabase response types
  (`supabase/`).
- `supabase/` — Supabase CLI config and `migrations/`, applied with
  `supabase db push` (see [schema.md](./schema.md)).
- `docs/` — project documentation.
- `*.test.ts` — Vitest unit tests, next to the file they cover
  ([architecture.md § Tests](./architecture.md#tests)).

## Where each feature lives

Every feature is a vertical slice: its pages under
`app/(protected)/(app)/<feature>/`, its API under `app/api/<feature>/`, and
`components/`, `hooks/` and `services/` folders of the same name, down to one
repository folder per table it reads.

| Feature | Pages | Doc |
| --- | --- | --- |
| Dashboard | `/dashboard` | [dashboard.md](./dashboard.md) |
| VMs | `/vms`, `/vms/[id]` (with the live health check) | [vms.md](./vms.md) |
| VM tracker | `/tracker`, reached from the VMs page | [tracker.md](./tracker.md) |
| Projects | `/projects`, `/projects/[id]` | [projects.md](./projects.md), with [jenkins-sync.md](./jenkins-sync.md), [docker-import.md](./docker-import.md), [github.md](./github.md), [ai-docs.md](./ai-docs.md) |
| Backups | `/backups`, `/backups/[id]` | [backups.md](./backups.md) |
| Users | `/admin/users` (admin) | [rbac.md](./rbac.md) |
| Settings | `/admin/settings` (admin) | [settings.md](./settings.md) |
| Sign-in | `/login` | [auth.md](./auth.md) |

## Reuse pattern

1. Clone this repo as the foundation for a new project.
2. Set your Supabase values (see [../README.md](../README.md) and
   `env.local.sample`).
3. Build each feature as a vertical slice through all five layers, following
   the email sign-up flow as the reference example.
4. Document any new table in [schema.md](./schema.md) and any new convention
   here so future projects stay consistent.
