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
`vm_urls` Supabase tables (shared across all authenticated users). Access is
gated by the passwordless email sign-in flow shipped in the auth slice.

The tracker feature is the reference example of a full vertical slice through
all five layers: `app/api/vms/*` (routing) → `components/vms/*` (UI) →
`hooks/vms/useVmTracker.ts` (hooks) → `services/vms/vmService.ts` (service) →
`repositories/vms` + `repositories/vmUrls` (repositories).

# Project conventions

Before implementing any feature, request, or fix, read and follow:

- [docs/architecture.md](docs/architecture.md) — the mandatory 5-layer
  architecture (routing → UI → hooks → services → repositories).
- [docs/ui-guidelines.md](docs/ui-guidelines.md) — shadcn/ui is the only
  allowed component library; install primitives via the shadcn CLI and
  compose feature components from them.
- [docs/schema.md](docs/schema.md) — database schema and the SQL workflow.
- [docs/auth.md](docs/auth.md) — the email sign-in flow and how to extend it.
- [docs/tracker.md](docs/tracker.md) — the VM tracker feature, its layers, and
  its API.

## Database / SQL workflow

Supabase tables are **never** created or altered by application code or
migrations run from the app. Instead:

- Every new table or schema change gets its own numbered `.sql` file in
  [`sql/`](sql) (e.g. `002_add_xyz.sql`), written so it can be pasted
  directly into the Supabase SQL Editor and run manually.
- The `sql/` folder is excluded from the Next.js build
  (`outputFileTracingExcludes` in `next.config.ts`) and from the TypeScript
  project (`tsconfig.json`) — it is documentation/ops only, never imported
  by app code.
- After adding or changing a `.sql` file, update
  [docs/schema.md](docs/schema.md) to match.

After making any code change, run `npm run build` and ensure it completes
with zero TypeScript errors, then run `npm run lint`, before considering the
task done.
