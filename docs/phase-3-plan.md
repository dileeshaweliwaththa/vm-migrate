# Phase 3 — Dashboard, theming & hardening

Phase 2 delivered the deployment platform: projects, environments, records,
per-project docs with AI generation, Jenkins config/sync/build-and-follow, and
RBAC. Phase 3 is about making it **legible and solid** rather than adding a new
domain:

1. a real **dashboard** that summarises the platform instead of placeholder stats,
2. a **professional theme** — the app was near-white throughout,
3. **security & consistency hardening** found by auditing the auth flows.

> Like [phase-2-plan.md](./phase-2-plan.md), this plan is binding on Phase 3
> work: follow [../AGENTS.md](../AGENTS.md) and the docs it points to.

---

## 1. Locked decisions

| # | Decision | Chosen |
| - | -------- | ------ |
| 1 | Dashboard data | **Derived only.** No new tables; the dashboard counts what other slices already store. |
| 2 | Dashboard rendering | **Server component + service, no hook layer** — read-once, no interaction. Revisit if filters arrive. |
| 3 | Palette | **shadcn `mauve`** for everything structural, **plus shadcn `green` for success only**. All values copied from ui.shadcn.com/colors via its registry. Failure is still carried by lightness, not red. |
| 4 | Chrome vs content | **Dark chrome, light content.** The sidebar is mauve-900 in *both* light and dark mode; the content area stays white in light mode. |
| 5 | VM tracker permissions | **Read-only for viewers.** The Phase 1 "any authenticated user has full access" RLS is replaced by the standard role split. |

---

## 2. Dashboard

See [dashboard.md](./dashboard.md) for the delivered design and the aggregation
rules. Summary of scope:

- Four headline tiles (projects, environments, records, builds this week).
- Migration progress from the tracker's own `computeStats`.
- Recent build feed from `environment_build_runs`.
- Breakdowns by stage, provider and record source.

New surface: `services/dashboard/dashboardService.ts`,
`components/dashboard/dashboard-overview.tsx`,
`types/common/dashboard.ts`, plus `findAllEnvironments` and
`findRecentBuildRuns` on the existing repositories.

---

## 3. Theme

Two rounds. The first fixed the mechanics: `--sidebar*` had **each variable
declared twice** in both `:root` and `.dark` (identical copy-paste), and light
mode painted the sidebar `oklch(0.985 0 0)` — effectively white, against a white
content area.

The second reduced it to the logo's two colours, because the app still didn't
hang together: it mixed navy, teal, sky, emerald, amber, purple and an unused
blue scale — seven hues, so no two surfaces looked related.

The third **replaced the hand-mixed ramps with shadcn's own scales**. The
two-hue system was right, but the ramps were eyeballed hex values, and
hand-mixing eleven steps does not produce the perceptually-even, contrast-checked
result a published scale does.

- Neutral is now shadcn **`mauve`**; accent is `--color-accent-step`
  (= mauve-600), so the accent can move along the ramp in one edit.
- `:root`/`.dark` are shadcn's `mauve` theme **verbatim**, with two documented
  deviations: no red (`destructive` is the darkest step), the accent step, and
  dark chrome in light mode (shadcn ships a light sidebar).
- Values were pulled from the registry (`/r/colors/mauve.json`,
  `/r/colors/index.json`) rather than eyedropped, so they are exact.
- The unused `--color-secondary-*`, `--color-accent-*` and
  `--color-success/pending/error` scales were deleted outright — dead tokens in
  hues that matched nothing.
- All 108 hardcoded Tailwind colour utilities across 7 feature components were
  replaced with semantic tokens: `tone-*` for status pills, `ink-*` for inline
  grid values, `positive`/`negative` for semantic fills. All are themed per mode,
  so call sites carry no `dark:` variants.
- Round 4 removed the last non-mauve values: the orange accent, `destructive`'s
  red, and the `positive`/`negative` green/red pair. Status is now weight-based
  (`danger` is an inverted dark fill) — the hue cue is gone, which is a real
  tradeoff, mitigated by every pill already rendering its status as text.
- Client vs UPVIEW VMs were purple vs sky — two unrelated hues. Now filled
  (client) vs outlined (ours): a shape difference, since hue isn't available.
- The "Migrated from" history panel was dark **red**, reading as an error when it
  is just history. Now a dark mauve band, with the status carried by a pill.

Two bugs fell out of the rework: `bg-primary` inside the sidebar rendered
invisibly against it (the logo mark), and `SidebarMenuButton` was styling
**every** nav item as active. See
[ui-guidelines.md § Theme](./ui-guidelines.md#theme-shadcn-mauve-plus-green-for-success).

---

## 4. Hardening (from the auth audit)

| Finding | Status |
| ------- | ------ |
| Jenkins credential exfiltration: `jobUrl.startsWith(base)` accepted `https://jenkins.corp.attacker.test/...`, sending the environment's Basic-auth token to an attacker-controlled host. Reachable by **any** signed-in role via `/jenkins-build` and `/jenkins-run`. | Fixed — `isSameJenkinsServer` compares parsed `URL.origin` (pins host, scheme *and* port), rejects non-HTTP schemes and embedded userinfo, and boundary-checks the context path. |
| VM tracker writable by viewers — a viewer could purge VMs while unable to rename a project. | Fixed — see [tracker.md § Permissions](./tracker.md#permissions). |
| `docker`-sourced records mapped to `manual` in `rowToPort`, hiding imported records from any by-source count. | Fixed — validated against `PORT_SOURCES`. |
| `docs/auth.md` documented the opposite of the real posture (open self-signup, magic links, guards listed as future work). | Rewritten — see [auth.md § Where access is enforced](./auth.md#where-access-is-enforced). |

Verified sound during the same audit and **not** changed: all 33 route handlers
re-check `getCurrentUser()`; the three RLS-bypassing service-role paths each sit
behind a service-layer role check; no privilege escalation via `profiles`; both
`SECURITY DEFINER` helpers set `search_path = ''`; no account enumeration on
sign-in.

---

## 5. Milestones & GitHub issues

Labels: `phase-3`, `epic:dashboard`, `epic:theme`, `epic:hardening`, `ui`,
`backend`, `security`, `migration`, `tech-debt`.

### Milestone M4 — Dashboard & theme

| ID | Issue | Depends on |
| -- | ----- | ---------- |
| F1 | **Dashboard summary**: service + server-rendered page + pure UI, replacing the placeholder stats | B1, B4, D2 |
| F2 | **Theme, round 1**: dark sidebar, de-duplicated CSS vars | — |
| F4 | **Theme, round 2**: reduce to the logo's two hues; purge all 108 hardcoded colour utilities | F2 |
| F6 | **Theme, round 3**: adopt shadcn scales from the registry; no hand-mixed values | F4 |
| F7 | **Theme, round 4**: single-hue mauve — remove orange, red, green and blue entirely; sidebar to mauve-950 | F6 |
| F8 | **Theme, round 5**: reinstate shadcn green for `success` only (build status + success pills); `primary` to mauve-800 | F7 |
| F5 | **Bug: every sidebar nav item rendered as active** — `data-active` presence vs value | F2 |
| F3 | **`docker` port-source mapping fix** | — |

### Milestone M5 — Hardening

| ID | Issue | Depends on |
| -- | ----- | ---------- |
| G1 | **Jenkins SSRF / credential-exfiltration fix** (`isSameJenkinsServer`) | D2 |
| G2 | **VM tracker RBAC**: viewer read-only, editor writes, admin purge/import | A1 |
| G3 | **Auth documentation correctness** | — |

### Milestone M6 — Known open work

| ID | Issue | Notes |
| -- | ----- | ----- |
| H1 | **Upgrade `radix-ui` 1.4.3 → 2.x** | The generated primitives style on boolean `data-*` attributes that 1.4.3 never emits. `switch` renders invisible; `tabs` renders an unstyled list — and the **projects tag filter uses `Tabs` today**. Already flagged in ui-guidelines as tracked separately. |
| H2 | **Remove dead `lib/supabase/session.ts`** | `getUserEmail()` has zero callers and imports the *browser* client while being described as a server helper — a trap if copied. |
| H3 | **Dashboard filters** | Per-client / per-date-range. This is the change that gives the slice a hook layer + `/api/dashboard` route. |

---

## 6. Rules & conventions

Unchanged from [phase-2-plan.md § 9](./phase-2-plan.md#9-rules--conventions-must-follow).
The two that bit most often in Phase 3:

- **Check a primitive's classes before using it** — see the Radix 1.4.3 trap in
  [ui-guidelines.md](./ui-guidelines.md). `Progress` is safe (inline `style`);
  `Tabs` and `Switch` are not.
- **Migrations are never run by app code.** `supabase migration new`, then
  `supabase db push`, then update [schema.md](./schema.md).
