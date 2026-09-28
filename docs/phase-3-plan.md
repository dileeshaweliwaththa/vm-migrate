# Phase 3 — Machines as pages, then monitoring

Phase 2 (v2.0.0) delivered the DevOps Portal: the tracker, projects and
environments, Jenkins, backups, the dashboard and the hardening pass. Its record
of *which machine does what* was still a spreadsheet, the VM Tracker, which is
built for one job: moving endpoints from old IPs to new ones.

Phase 3 makes **the machine the unit you look at**:

1. **VMs as pages.** A list of every machine, and a page per machine with
   everything tied to it.
2. **Monitoring.** Whether a machine's endpoints actually answer, and then its
   resource usage.

Work lands on the **`phase-3`** branch, cut from the v2.0.0 release commit.
Issues carry the `phase-3` label.

> Like [phase-2-plan.md](./phase-2-plan.md), this plan is binding on Phase 3
> work: follow [../AGENTS.md](../AGENTS.md) and the docs it points to.

---

## 1. Locked decisions

| # | Decision | Chosen |
| - | -------- | ------ |
| 1 | Nav | The sidebar's **VM Tracker** becomes **VMs** (`/vms`). The tracker keeps `/tracker` and is reached from the VMs page; the nav item is active on both. |
| 2 | First monitoring cut | **Resources + live endpoint health.** Server-side HTTP/TCP probes, on demand, nothing stored. |
| 3 | Editing | **The VM page is read-only.** The tracker already owns the edit, trash and restore rules and their role checks; the page links there. |
| 4 | Schema | **None for the first slice.** Everything shown is already stored. |
| 5 | Backups ↔ VM | Matched by **database host** against the machine's addresses; `backup_targets` has no `vm_id` by design. |
| 6 | Health-check access | **Every signed-in role.** It only probes stored addresses, which only editors can set. Recorded as accepted risk [A9](./security.md#a9). |

---

## 2. Milestones & GitHub issues

Labels: `phase-3`, `epic:vms`, plus `ui` / `backend` / `security` /
`documentation` as they apply.

### VMs (#103, umbrella)

| Issue | Slice |
| ----- | ----- |
| #104 | VMs list page (All / UPVIEW / Client) and nav rename |
| #105 | VM page: every resource on the machine (`GET /api/vms/:id`) |
| #106 | Live endpoint health checks (`GET /api/vms/:id/health`) |
| #107 | Docs: [vms.md](./vms.md), this plan, and the files that reference them |

### Next: resource monitoring

CPU, memory and disk from **Azure Monitor**. It needs:

- **An Azure service principal:** a service-role-only secrets table and a
  **Settings → Azure** section, the same pattern as GitHub
  ([github.md](./github.md)).
- **Each VM's Azure resource ID** on `vms`: a migration.
- **A repository calling the Azure Monitor REST API:** a new documented
  exception to the "repositories only talk to Supabase" rule.

To be filed as its own issue when it starts.

### Carried over (still open from Phase 2)

#28, #29, #31, #33, #34, #35, #45, #74, #75, #84, #92, #93. They stay labelled
`phase-2`; they're Phase 2 debt, and will be picked up here.

---

## 3. Rules & conventions

Unchanged from [phase-2-plan.md § 9](./phase-2-plan.md#9-rules--conventions-must-follow).
The two most relevant here:

- **Every new outbound request goes through the SSRF checklist.** See
  [security.md § Checklist for new code](./security.md#checklist-for-new-code). The
  health probes follow it: the denylist, no credentials, no redirects, no response
  body returned, and bounded.
- **Fixed value sets are one constant.** `VM_OWNERSHIP_FILTERS`,
  `HEALTH_STATES` and `HEALTH_TARGET_KINDS` in `types/common/vm.ts`.
