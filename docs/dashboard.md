# Dashboard

The landing page at `/dashboard` (Phase 2, v2.0.0). It answers three questions at a
glance — **how much is there**, **how far along is the migration**, and **what
has been deployed lately** — and links out to the pages that can change any of
it. Readable by every signed-in role.

It owns **no tables**. Every number is derived from what the projects,
environments, VM-tracker and build-run slices already store, so the dashboard
can never disagree with the page you drill into.

## Layers

| Layer      | Files                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| Routing    | `app/(protected)/(app)/dashboard/page.tsx`, `app/api/dashboard/route.ts` (`GET ?client=&days=`) |
| UI         | `components/dashboard/dashboard-view.tsx` (header + filters), `dashboard-overview.tsx` (the tiles) |
| Hook       | `hooks/dashboard/useDashboard.ts`                                             |
| Service    | `services/dashboard/dashboardService.ts` (the reads), `summary.ts` (the counting; pure and tested) |
| Repository | `environments`, `environmentBuildRuns` (+ `projectService` / `vmService`)      |

Domain types live in [`types/common/dashboard.ts`](../types/common/dashboard.ts).

### Filters

Two filters sit in the page header (#75):

- **Client**: one project tag, or all clients. It narrows every tile: the
  projects tagged with it, their environments and records, the builds of those
  environments, and the migration bars, which then cover the VMs those
  environments run on. The list of clients to pick from is always the whole
  workspace's.
- **Build window**: the last 7, 30 or 90 days (`DASHBOARD_BUILD_WINDOWS`). It
  only moves the build tile and the recent-builds feed.

The page renders the default view (all clients, 7 days) on the **server** and
hands it to `useDashboard` as initial data, so the first paint needs no fetch. A
filter change asks `GET /api/dashboard?client=…&days=…`, and the previous
numbers stay on screen, dimmed, until the new ones arrive. An unknown client or
window falls back to all clients and 7 days, and `summary.filters` says what
was applied.

The reads always cover the whole workspace and the filtering happens in
`buildDashboardSummary`, which is pure. That keeps the reads simple and puts
the rules where Vitest can check them (`summary.test.ts`).

## What it shows

**Four headline tiles** — Projects, Environments, Deployed records, Builds in
the chosen window. Each carries a sub-line of context (clients, Jenkins/VM wiring, reachable
URLs — a record with a domain, or on a managed platform with only its platform
default domain — pass/fail split) and the first two link onward to `/projects`.

**Migration progress** — VMs migrated, DNS updated, URLs tested, each as a
ratio + bar, computed with the tracker's own `computeStats`
([lib/vm-utils.ts](../lib/vm-utils.ts)) so the numbers match `/tracker` exactly.
The URL counts come from the one `endpoints` table, so they include the records
added from projects — see
[tracker.md](./tracker.md#urls-live-in-one-table-shared-with-projects).

**Recent builds** — the last 8 runs from `environment_build_runs`, newest first,
with job, build number, who triggered it, and outcome. Result pills reuse
`STATUS_TONE_CLASS`, so green means the same thing here as in the tracker.

A run is **two stacked lines**, not one row: job + outcome pill, then `who ·
when`. The pill is fixed-width and can't shrink, so sharing a line with it cost
the text ~5rem it didn't have on a phone. On the meta line the timestamp is
fixed-length and pinned (`shrink-0`) while the user label ellipsizes — the *when*
is what has to survive a narrow screen. It's formatted `12 Aug, 15:04` and the
locale is pinned, because this page renders on the **server**: an implicit locale
would be the container's, not the reader's, and seconds and the year say nothing
in a 7-day feed. The same shrink discipline is why **Migration progress** never
breaks a ratio across two lines.

**Breakdown** — environments by stage and CI/CD provider, records by source, plus
the client tag list.

## Aggregation rules

These are the decisions worth knowing before changing `dashboardService`:

- **One query per collection, run concurrently.** `findAllEnvironments` fetches
  every environment *with its ports* in a single query rather than looping
  `findProjectEnvironments` per project, and the four independent reads go
  through `Promise.all`.
- **Archived projects self-gate.** The service calls `listProjects(true)`, which
  returns archived rows to **admins only**. Non-admins therefore see
  `archived: 0` — no separate role check is needed here, and none is performed.
- **Build window.** The aggregate covers the last **7, 30 or 90 days**, capped
  at 2,000 rows. If the cap is hit the tile shows `2000+`, because the counts are
  then a floor. One query serves both the aggregate and the 8-row feed sliced off
  its front.
- **"In flight" uses `isTerminalRunPhase`** — the same predicate the run poller
  uses, so the dashboard and the per-environment build card never disagree.
- **Failed is deliberately coarse:** any terminal run whose result isn't
  `SUCCESS`. The dashboard answers "is anything broken?"; the per-environment
  history carries the exact `UNSTABLE`/`ABORTED` distinction.
- **Fixed breakdown order.** Counts are tallied into their enum's order
  (`ENVIRONMENT_NAMES`, `CICD_PROVIDERS`, `PORT_SOURCES`), never row order.
  Stages keep zero rows — an empty `PRODUCTION` column is itself the interesting
  fact — while providers and sources drop theirs to stay readable.
- **`0/0` renders as a full muted bar, not 0%.** Nothing tracked yet is not the
  same as nothing done.

## Extending it

- A new tile: add the field to `DashboardSummary`, compute it in
  `buildDashboardSummary` (with a test), and render it in `DashboardOverview`.
  If it needs data the service doesn't read yet, add the read to
  `getDashboardSummary`. Don't query from the component.
- A new filter: add it to `DashboardFilters` and `parseDashboardFilters`, apply
  it in `buildDashboardSummary`, and add the control to `DashboardView`.
