# Project structure guide

A quick "where does this go?" map. The authoritative rules live in
[architecture.md](./architecture.md) (the 5-layer model) and
[ui-guidelines.md](./ui-guidelines.md) (shadcn/ui).

## Core folders

- `app/` — **routing layer**: route-based pages, layouts, and API route
  handlers. No business logic, no direct DB access.
- `components/` — **UI layer**: `ui/` holds shadcn primitives; feature
  folders (`auth/`, …) compose them. `providers/` holds app-wide context
  providers.
- `hooks/` — **hook layer**: TanStack Query wrappers bridging UI to services.
- `services/` — **service layer**: business logic and orchestration, no React.
- `repositories/` — **repository layer**: Supabase queries only, one file per
  entity.
- `lib/` — cross-cutting utilities and integrations (env, query client,
  Supabase clients, `cn()`).
- `types/` — shared domain types (`common/`) and raw Supabase response types
  (`supabase/`).
- `sql/` — manual Supabase migrations, applied by hand (see
  [schema.md](./schema.md)).
- `docs/` — project documentation.

## Reuse pattern

1. Clone this repo as the foundation for a new project.
2. Set your Supabase values (see [../README.md](../README.md) and
   `env.local.sample`).
3. Build each feature as a vertical slice through all five layers, following
   the email sign-up flow as the reference example.
4. Document any new table in [schema.md](./schema.md) and any new convention
   here so future projects stay consistent.
