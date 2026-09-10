# Dashboard

The landing page at `/dashboard` (Phase 3). It answers three questions at a
glance — **how much is there**, **how far along is the migration**, and **what
has been deployed lately** — and links out to the pages that can change any of
it. Readable by every signed-in role.

It owns **no tables**. Every number is derived from what the projects,
environments, VM-tracker and build-run slices already store, so the dashboard
can never disagree with the page you drill into.

## Layers

| Layer      | Files                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| Routing    | `app/(protected)/(app)/dashboard/page.tsx`                                    |
| UI         | `components/dashboard/dashboard-overview.tsx`                                 |
| Hook       | — none. See [No hook layer](#no-hook-layer).                                  |
| Service    | `services/dashboard/dashboardService.ts` — `getDashboardSummary`               |
| Repository | `environments`, `environmentBuildRuns` (+ `projectService` / `vmService`)      |

Domain types live in [`types/common/dashboard.ts`](../types/common/dashboard.ts).

### No hook layer

The summary is read-once with no interaction, so the page is a **server
component** that calls the service directly and passes the result into a pure
component as props. That satisfies the
[architecture](./architecture.md) rules — pages may call services, and the
component imports nothing from `services/`. Add a hook only if the dashboard
later needs client-side refetching or filters.

## What it shows

**Four headline tiles** — Projects, Environments, Deployed records, Builds this
week. Each carries a sub-line of context (clients, Jenkins/VM wiring, reachable
URLs, pass/fail split) and the first two link onward to `/projects`.

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
- **Build window.** The aggregate covers the last **7 days**, capped at 200 rows.
  One query serves both the aggregate and the 8-row feed sliced off its front.
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
  `getDashboardSummary`, render it in `DashboardOverview`. Don't query from the
  component.
- Per-client or per-date filtering: that's the point at which this slice needs a
  hook + an `/api/dashboard` route, because the reads stop being read-once.
