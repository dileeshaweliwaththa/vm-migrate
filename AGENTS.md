<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project overview

**VM Migration Tracker** — an internal tool for tracking virtual machines and
their endpoints (URLs) as infrastructure is migrated from old IPs to new ones.
It is built on a Next.js + Supabase foundation with a strict layered
architecture.

The main feature is the tracker at `/tracker` (protected): a spreadsheet-style
grid of VMs split into UPVIEW (our servers) and Client sections, each with
per-endpoint rows, live migration stats, soft-delete trash with restore/purge,
migrated-URL archiving, and JSON import/export. Data lives in the `vms` and
`endpoints` Supabase tables (shared across all authenticated users; `endpoints`
is the one URL table, shared with the projects pages). Access is
gated by the passwordless email sign-in flow shipped in the auth slice.

`repositories/jenkins/jenkinsRepository.ts` and
`repositories/backups/backupApiRepository.ts` are the **only** repositories that
talk to something other than Supabase — the documented external-HTTP exception.
Both share the outbound URL rules in [lib/outbound-url.ts](lib/outbound-url.ts).

The tracker feature is the reference example of a full vertical slice through
all five layers: `app/api/vms/*` (routing) → `components/vms/*` (UI) →
`hooks/vms/useVmTracker.ts` (hooks) → `services/vms/vmService.ts` (service) →
`repositories/vms` + `repositories/endpoints` (repositories).

# Project conventions

Before implementing any feature, request, or fix, read and follow:

- [docs/architecture.md](docs/architecture.md) — the mandatory 5-layer
  architecture (routing → UI → hooks → services → repositories).
- [docs/ui-guidelines.md](docs/ui-guidelines.md) — shadcn/ui is the only
  allowed component library; install primitives via the shadcn CLI and
  compose feature components from them. Also the **theme** (navy chrome, light
  content) and the Radix 1.4.3 traps — read it before using a primitive.
- [docs/schema.md](docs/schema.md) — database schema and the migration workflow.
- [docs/auth.md](docs/auth.md) — the sign-in flow, and **where access is
  enforced** (page guard / route handler / role + RLS).
- [docs/security.md](docs/security.md) — the threat model, the secrets inventory,
  the SSRF and stored-HTML rules, the **accepted** risks, and the checklist every
  new route/table/outbound fetch has to pass.
- [docs/tracker.md](docs/tracker.md) — the VM tracker feature, its layers, its
  API, and its per-role permissions.
- [docs/dashboard.md](docs/dashboard.md) — the `/dashboard` summary and its
  aggregation rules.
- [docs/deployment.md](docs/deployment.md) — the Docker image and compose setup,
  and the build-time vs runtime environment split (`NEXT_PUBLIC_*` are inlined at
  build time, so they are **build args**).
- [docs/jenkins-sync.md](docs/jenkins-sync.md) — per-environment Jenkins config,
  port sync, and how a triggered build is followed to completion.
- [docs/docker-import.md](docs/docker-import.md) — importing environment records
  from pasted `docker ps` output.
- [docs/backups.md](docs/backups.md) — the **Backups** tab: the registry of MySQL
  backup services, what is read through to them rather than stored, and the role
  split on running vs deleting a backup.

## Database / migration workflow

Supabase tables are **never** created or altered by application code or by
migrations run from the app. Schema changes are managed with the **Supabase
CLI** and live in [`supabase/migrations/`](supabase/migrations):

- Create each schema change with `supabase migration new <name>`, which writes
  a timestamp-prefixed `.sql` file to `supabase/migrations/`. Migrations apply
  in timestamp order.
- Deploy to the linked remote project with `supabase db push` (or apply to a
  local stack with `supabase db reset` / `supabase migration up`).
- The `supabase/` folder is excluded from the Next.js build
  (`outputFileTracingExcludes` in `next.config.ts`) and from the TypeScript
  project (`tsconfig.json`) — it is ops-only, never imported by app code.
- After adding or changing a migration, update
  [docs/schema.md](docs/schema.md) to match.

## Types, enums & constants

Fixed value sets are modelled as **enums**, never as ad-hoc string literals or
repeated arrays:

- **Database:** a column whose values come from a fixed set uses a Postgres
  **enum type** (e.g. `user_role`, `cicd_provider`, `net_protocol`,
  `port_source`), not `text` + a `CHECK` constraint. Create the enum with
  `create type … as enum (…)` (guarded with a `duplicate_object` `DO` block so
  the migration is re-runnable) and convert existing columns via
  `alter column … type … using …::…`.
- **TypeScript:** each set has **one** source of truth — a
  `const X = [...] as const` array with a derived
  `type X = (typeof X)[number]` — and everything else imports it (e.g.
  `USER_ROLES`, `CICD_PROVIDERS`, `PROTOCOLS`, `PORT_SOURCES`). The DB enum and
  the TS constant must list the same values in the same order.
- **No magic strings.** Don't re-type `'admin'`/`'editor'` checks or duplicate
  role arrays across files. Use the shared constants and the helpers in
  [`lib/rbac.ts`](lib/rbac.ts) (`isAdmin`, `canEdit`) for role logic; add a
  helper rather than repeating a comparison.

After making any code change, run `npm run build` and ensure it completes
with zero TypeScript errors, then run `npm run lint`, before considering the
task done.
