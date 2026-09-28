# VMs

**Phase 3** (#103). Machines as pages of their own, not just rows in a grid:

- **`/vms`** lists every VM in service as cards.
- **`/vms/[id]`** is one machine's page: everything tied to it, plus a live
  check of whether its endpoints answer.

The **VM Tracker** (`/tracker`, [tracker.md](./tracker.md)) is unchanged. It is
still where machines are created, edited, trashed and migrated, and it's now
reached from the VMs page. The sidebar's **VMs** item stays active on both.

## Layers

| Layer      | Files |
| ---------- | ----- |
| Routing    | `app/(protected)/(app)/vms/page.tsx`, `app/(protected)/(app)/vms/[id]/page.tsx` (resolves the role), `app/api/vms/[id]/route.ts` (`GET`), `app/api/vms/[id]/health/route.ts` |
| UI         | `components/vms/vms-dashboard.tsx` (the list), `components/vms/vm-detail.tsx` (the machine page) |
| Hook       | `hooks/vms/useVmTracker.ts` (`useTrackerData`, shared with the tracker), `hooks/vms/useVmDetail.ts` (`useVmDetail`, `useVmHealth`) |
| Service    | `services/vms/vmService.ts` (`getVmDetail`), `services/vms/vmHealthService.ts` (`checkVmHealth`) |
| Repository | the tracker's repositories, plus `findEnvironmentsWithProjectForVm` in `repositories/environments/environmentRepository.ts`, and `repositories/health/endpointProbeRepository.ts`, which makes outbound HTTP/TCP probes (a documented exception, see AGENTS.md) |

Domain types are in `types/common/vm.ts`: `VmDetail`, `VmHostedEnvironment`,
`VmBackupTarget`, `EndpointHealth`, `VmHealthReport`, and the fixed sets
`VM_OWNERSHIP_FILTERS`, `HEALTH_STATES`, `HEALTH_TARGET_KINDS`.

**No schema change.** Everything shown is already stored.

## The list — `/vms`

- **Data:** reads the tracker's own payload (`GET /api/vms` → `useTrackerData`),
  so the list and the grid share one cache and can't disagree. Trashed VMs
  aren't listed; the trash belongs to the tracker.
- **Filter:** **All / UPVIEW / Client**. This is `Vm.isClient`, the same split
  the tracker renders as its two sections. There's also a search over the name,
  the IPs (including extra addresses) and the group.
- **Header stats:** total, UPVIEW, Client, and migrated `x / y`.
- **Header action:** a **VM Tracker** button.
- **Card:** the name; UPVIEW / Client, group, Migrated / Not migrated and
  Supabase badges; the live address (`vmLiveIp`) with how many extra addresses
  it has; chips for endpoints, environments hosted and Jenkins. The whole card
  links to the machine's page.

## The machine page — `/vms/[id]`

**`GET /api/vms/:id` → `getVmDetail`** returns one `VmDetail`. It's `404` for an
unknown id *and* for a trashed VM, because a page for a machine that isn't in
service would read as live.

| Section | Reads |
| ------- | ----- |
| **Overview**: old / new IP, migration, owner, group, Supabase, keep, notes | `vms`, `vm_groups` |
| **Addresses**: the primary address, plus each extra one with origin, label, "moved from" and date | `vm_ips` |
| **Endpoints**: every endpoint on the machine, both the tracker's own and project records whose environment sits here, with the direct `ip:port` link, the domain link, protocol, who owns it (linking to the project), DNS / tested, and the health pills | `endpoints`, via `vm_id` or `environments.vm_id` |
| **Projects & environments**: what's deployed here, with record counts | `environments` + `projects` |
| **Jenkins**: the server (a link), user, whether a token is stored, and **Test connection** for editors (the existing `POST /api/vms/:id/jenkins/test`) | `vm_jenkins` (secret-free `VmJenkinsConfig`) |
| **Backups**: targets whose database host is one of the machine's addresses | `backup_targets` |

**Backups are matched by host.** `backup_targets` has no `vm_id`: it was dropped
in `…_backup_targets_config.sql`, because a target is a *database server*, which
may be a managed database rather than a VM we track. So a target shows up on a
machine when its `db_host`, compared bare and case-insensitively, is one of that
machine's addresses (old IP, new IP, or an extra one).

**The page is read-only.** Its **Open in VM Tracker** action is where edits
happen, under the tracker's existing rules.

**Layout.** It uses the full width of the screen, with no centred column. Overview,
Addresses, Projects & environments and Jenkins sit four across on a wide screen
and fold to two, then one. Endpoints and Backups run full width below them.

**The endpoints table is one line per endpoint.** Each Direct / Domain cell holds
its link (truncated, with the full address as the tooltip) and a fixed-size
**UP / DOWN / SKIPPED** pill. The columns are `table-fixed`, so a long domain
can't push into its neighbours. The detail is behind the row's **(i)** button: for
each probe, the target, its HTTP status and time, and the reason when it's down;
then the address the endpoint answers on (primary or which extra IP), its port
and protocol, DNS / tested, and its notes.

The environment card on a project page links its VM chip here (it used to go to
`/tracker`).

## Endpoint health

**`GET /api/vms/:id/health` → `checkVmHealth`** probes the machine's endpoints
from the server. It runs when the page opens and again from **Check now**.
Nothing is stored; a check is a snapshot. It's cached for a minute on the
client, and not refetched on focus.

### What's probed

| Endpoint protocol | Targets |
| ----------------- | ------- |
| HTTP / HTTPS / WS / WSS | **direct**: `recordLiveUrl`, the same `http://ip:port` the Link column opens. **domain**: `domainUrl`, `https://host`, when a domain is set |
| TCP | a TCP connect to `ip:port` |
| UDP | skipped (there's no reliable connectionless check) |

The address used is the extra IP the endpoint names (`ipId`) if it has one,
otherwise the machine's live address. That's the same rule as the links
everywhere else, so the check probes exactly what the page links to.

### Reading the result

- **up:** an HTTP response with a status **below 500**, or a completed TCP
  handshake. A 404 on `/` is an API with no root route, not an outage, so the
  status code is shown to be read.
- **down:** a 5xx, or no answer. The reason says why: timed out, connection
  refused, domain doesn't resolve, TLS certificate problem, and so on.
- **skipped:** UDP, a record with no port or no address yet, or a denied target.

### Limits and rules

- A 4 s timeout per probe, 6 at a time, and at most **40 targets per check**. The
  worst case is about 28 s, and the report counts any targets beyond the limit
  (`truncated`) rather than silently dropping them.
- **Denied targets are never fetched:** `isDeniedOutboundTarget`
  (`lib/outbound-url.ts`) covers link-local and metadata addresses.
- **No credentials:** no `Authorization` header and no cookies. The only header
  is a fixed `User-Agent`.
- **`redirect: 'manual'`:** a 3xx is the answer, never a hop somewhere else.
- **The body is never read:** it's cancelled unread, so only the status, the
  timing and a reason reach the caller.

See [security.md § SSRF](./security.md#ssrf) and [A9](./security.md#a9).

## Access

| Action | Who | Gate |
| ------ | --- | ---- |
| See the list and a machine's page | every signed-in role | route session check; select-open RLS on every table read |
| Run the health check | every signed-in role | `canCheckHealth` (`lib/rbac.ts`), in `checkVmHealth` |
| Test the Jenkins connection | editor+ | `requireEditor` in `testVmJenkinsConnection` (the button is hidden for viewers) |
| Edit anything | editor+ | in the tracker, as before ([tracker.md](./tracker.md)) |

## Not in this cut

CPU, memory and disk from Azure Monitor. That needs an Azure service principal
and each VM's Azure resource ID stored, so it's its own slice
([phase-3-plan.md](./phase-3-plan.md)).
