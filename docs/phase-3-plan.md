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
| 3 | Palette | **Brand navy `#162d47` + teal `#2e86ab`**, already defined in `globals.css`. Not a new palette — the sidebar simply wasn't using it. |
| 4 | Chrome vs content | **Dark chrome, light content.** The sidebar is solid navy in *both* light and dark mode; the content area stays light in light mode. |
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

`--sidebar*` in both `:root` and `.dark` had **each variable declared twice**
(identical copy-paste), and light mode painted the sidebar `oklch(0.985 0 0)` —
effectively white, against a white content area. Phase 3:

- Sidebar → brand navy, teal for the **active** nav item.
- Chart ramp → one cohesive teal→navy series plus amber/rose for the warn/bad
  end, so a status colour never collides with a series colour.
- Duplicated declarations removed.

The primitive marks the active item with `--sidebar-accent`, which is only a
shade off the sidebar itself, so `app-sidebar.tsx` overrides `data-active:` to
teal. Anything that hardcoded `bg-primary` inside the sidebar had to change too:
`primary` *is* the navy the sidebar is now painted with, so the logo mark was
navy-on-navy.

See [ui-guidelines.md § Theme](./ui-guidelines.md#theme-navy-chrome-light-content).

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
| F2 | **Theme**: navy sidebar + teal accent, cohesive chart ramp, de-duplicated CSS vars | — |
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
