# VM Migration Tracker

The tracker is the app's main feature and the reference example of a full
vertical slice through all five layers (see [architecture.md](./architecture.md)).

## Layers

| Layer      | Files                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Routing    | `app/(protected)/(app)/tracker/page.tsx` (resolves the role), `app/api/vms/**/route.ts`, `app/api/vm-groups/**/route.ts` |
| UI         | `components/vms/vm-tracker.tsx`, `vm-row.tsx`, `vm-card.tsx`, `vm-fields.tsx`, `vm-addresses.tsx`, `vm-groups.tsx`, `vm-view-toggle.tsx`, `vm-trash.tsx`, `yes-no-toggle.tsx` |
| Hook       | `hooks/vms/useVmTracker.ts` (TanStack Query query + mutations), `hooks/vms/useVmGroups.ts` (group mutations) |
| Service    | `services/vms/vmService.ts` (mapping, soft delete, restore, addresses, import), `services/vms/vmGroupService.ts` (groups) |
| Repository | `repositories/vms/vmRepository.ts`, `repositories/endpoints/endpointRepository.ts`, `repositories/vmIps/vmIpRepository.ts`, `repositories/vmGroups/vmGroupRepository.ts` |

Presentation helpers (`buildFullUrl`, `vmAddresses`, `endpointAddress`,
`safeStatus`, `migratedSources`, `computeStats`, `groupVms`) live in
`lib/vm-utils.ts`; shared domain types in `types/common/vm.ts`; raw row types in
`types/supabase/response/{vms,vmIps,endpoints,vmGroups}`.

## Two views over one VM

The header carries a **Table / Cards** toggle. Both render the same VMs with the
same edit behaviour — a card is a re-layout, not a second feature — so the rule
is that **nothing forks**:

| Shared | Where it lives |
| ------ | -------------- |
| The callback set both views take | `VmHandlers` in `vm-fields.tsx` |
| The field editor and the status pill | `CellInput`, `StatusPill` (same file) |
| Which sources migrated onto a VM | `migratedSources` in `lib/vm-utils.ts` |
| Whether a VM is open | `vm.expanded` — one flag, not one per view |

Because expansion is on the VM, a card opened in one view is open in the other,
and **Expand All / Collapse All drive both**.

`CellInput` is the one thing that renders differently, through a `variant`: the
grid gets `cell` (borderless, transparent — a row of bordered boxes reads as a
form, not a spreadsheet), the card gets `field` (the plain Input, since each
value sits alone under a label and needs an edge to look editable).

Two deliberate differences in the card:

- **Migrated-from lists sources only**, not each migrated URL. The grid has the
  width to nest them; at card width they would bury the VM's own fields.
- **"+ Add URL" is not gated on being expanded.** The handler expands the VM
  anyway, so hiding it would mean opening the card just to reach the button.

The choice is stored in `localStorage` (`vm-tracker-view`) — a viewing
preference, not data, so it is per browser and never hits the API. It is read
through `useSyncExternalStore`, not an effect: that keeps the server and the
first client render agreed (the server snapshot is the default), avoids the
cascading render `react-hooks/set-state-in-effect` rejects, and syncs other
tabs. Writers notify local listeners by hand because `storage` doesn't fire in
the tab that wrote.

**Old IP and New IP are left-aligned** in the grid, like the name beside them —
centred addresses in a fixed-width column left ragged gaps on both sides of every
value. Ports and the Yes/No columns stay centred: those are short, uniform tokens
being scanned down a column.

The toggle is **layout, so every role gets it** — including viewers, who see the
same read-only treatment in either shape.

## URLs live in one table, shared with Projects

There is **one** URL table — [`endpoints`](./schema.md#endpoints) — and both this
page and the projects pages read and write it. Before, the tracker had `vm_urls`
and projects had `environment_ports`, which meant the same endpoint was entered
twice and a URL added to a project was invisible here.

An environment already points at a VM, and that is the bridge: a project record
appears in the tracker under whatever VM its environment sits on, resolved at
read time. The row never stores a second copy of the VM, so moving an
environment to another host moves its URLs with it.

**Two kinds of row, one table:**

| | created from | shown in the tracker | badge |
| --- | --- | --- | --- |
| project record (`environment_id`) | the project's environment | yes, under the environment's VM | `PROJECT · STAGE`, linking to the project |
| VM-owned (`vm_id`) | the tracker's **+ Add URL** | yes | none — unlabelled is the tracker's own |

**Add where it belongs, edit anywhere, delete where you added it.** The tracker
keeps **+ Add URL**, and it creates a VM-owned row — a machine with no project
behind it is exactly what the tracker was built for. Port, protocol, domain,
DNS, tested and notes are editable on either page for either kind: they are the
same facts, and the DNS/tested checklist is worked through here. Deleting stays
with the owner — the tracker hides the delete button on a project record (its
badge is the way to the project) and `vmService.deleteUrl` refuses it, so the
projects page can't lose rows to a page that never created them.

**Adding an endpoint the tracker already has adopts it.** If a VM-owned row for
that port already exists on the environment's VM, adding the record from the
project takes that row over — same id, and its DNS/tested ticks and notes are
kept — instead of creating a second row for one endpoint. This is the runtime
half of the table unification, and every project-side add path goes through it:
the records form, the `docker ps` import, and the Jenkins sync
(`addPort` / `findAdoptableEndpoint` in `services/environments/environmentService.ts`).

Matching is narrow on purpose, because **the same port on one host is
legitimate** — an nginx box serves `admin.example.com:443` and
`api.example.com:443` on the same port. Adoption needs the same port and
protocol *and* a compatible host: either the tracker row has no URL yet (the
usual case) or it names the same host. Anything else is a different endpoint and
gets its own row.

One gap worth knowing: this fires when a record is *added*. Editing a tracker
row's port until it matches a project record is not deduped — the tracker's
badge is what makes the pair visible.

A managed-platform environment (Amplify/AWS/Azure) has no VM, so its records
never appear here. That is correct: there is no machine.

**There is no Protocol column.** It was a dropdown on a value that is HTTPS for
effectively every endpoint, and the projects records table never had one. `proto`
is still on the row — it is what builds the Full New URL — it just isn't a cell
to fill in. A non-HTTPS endpoint will therefore render its built URL as `https://`
until the value is changed in the data.

**Stats count every endpoint on a VM**, project records included — that is the
point of one table. `computeStats` reads `vm.urls`, which is now the union.

**Export / import.** The export carries every URL a VM serves, each marked with
its owner. The replace-all import restores **only the VM-owned ones**: a
project's records belong to that project and are still attached to their
environment, so recreating them would duplicate every one as a VM-owned row. A
backup written before the tables were unified has no ownership fields and
imports exactly as it always did.

The export also carries each VM's extra addresses and each URL's `ipId`.
Recreating the addresses mints new ids, so the import remaps every `ipId` through
them, exactly as it remaps `groupId` — an id that doesn't survive the remap lands
on the primary rather than failing the import. `sourceVmId` is deliberately *not*
remapped onto the freshly minted VM ids: the name snapshot is what the provenance
is read from, and a dangling FK would be worse than a null one.

## A VM can hold several addresses

`old_ip` and `new_ip` say *"this machine moved from A to B"*. That is one of the
two things that happen. The other is that a box is **decommissioned and its public
IP is reattached to another machine** — the endpoints keep resolving exactly where
they always did, no DNS record is touched, and the destination now answers on two
addresses. Recording that as `old_ip → new_ip` on the retired machine is a claim
that its URLs were repointed, which they were not.

So an address is a child of the machine ([`vm_ips`](./schema.md#vm_ips)), and an
endpoint names the one it answers on ([`endpoints.ip_id`](./schema.md#endpoints)).

**Only the extras are rows.** `vms.new_ip` is still the machine's own address and
is still an ordinary field on the VM row. `vm_ips` holds what it has adopted
beyond that, so a single-address VM has no rows, no band and no picker — it looks
exactly as it always has. Everywhere the app says "which address", **null means
the primary**: `VmUrl.ipId`, `VmAddress.id`, `endpoints.ip_id`. That is what makes
this a pure add rather than a migration of every existing row.

**Provenance is stored, not inferred.** "Migrated from" works by matching
`s.newIp === vm.newIp && s.oldIp !== s.newIp` — a rule that can never see an
address that moved *without changing*. `vm_ips.source_vm_id` (plus the
`source_vm_name` snapshot, which survives that VM being removed) is the explicit link
instead. An adopted address is deliberately **not** added to `migratedSources`:
its endpoints are live rows on this VM, not a snapshot of a machine that no longer
serves them, so listing them there would render every one of them twice. Where the
address came from is shown once, on the address itself.

**Rendering — a band, not a column.** The grid is 1800px of fixed columns, and a
sixteenth would have to be threaded through every `colSpan` in the tracker. The
addresses use the full-width band the group headers and the "Migrated from" rows
already use, and both views render the same `VmAddressList`:

```
▾ CLIENT-SERVER-2        52.146.10.96  (+1 IP)              3 URLs
  ADDRESSES  [52.146.10.96 PRIMARY 0 URLs]  [172.174.105.129 MOVED ← DATING APP 3 URLs ✎ ✕]  + Add IP
```

- The **`+1 IP` chip** in the New IP cell is the collapsed-row signal; the band
  names them. Both views carry it.
- Each chip counts the endpoints on that address, which is the question the band
  exists to answer.
- The **URL row's address picker** only renders on a machine with more than one
  address. Elsewhere it is the address as plain text — no control to ignore.
- A viewer on a single-address VM gets **no band at all**: it would be a label
  over one value already visible in the row above. A viewer on a multi-address VM
  gets the chips, read-only.

**"Moved from another VM" is one action, not three.** Adding an address opens a
dialog with two modes — newly assigned, or moved from another machine. Picking a
tracked machine in the second mode submits as a *move*
(`POST /api/vms/:id/ips/move`), which in one call takes the address with its
provenance, brings that machine's **VM-owned** endpoints across with their ids,
DNS ticks and notes intact, and sends it to the trash. Doing that by hand is three
edits in three places, and a tracker with two of the three applied describes a
migration that never happened — which is the state this was built to fix.

**Both kinds of URL move, by different means.** They name their VM in different
places, so bringing them across takes two writes:

| | how it moves |
| --- | --- |
| VM-owned (`vm_id`) | the row is repointed: `vm_id` → the destination, `ip_id` → the new address |
| project record (`environment_id`) | the **environment** is repointed (`environments.vm_id`), and the records follow it — plus `ip_id` on each, so they build the right URL |

Repointing the environment is a write into the projects slice, and it is the
right one: an environment left on a retired machine claims a host that no longer
exists. Leaving those records behind would strand them under a trashed VM, which
is worse than not moving them at all.

Two more details worth knowing:

- The address offered by default is the source's **`old_ip`**, not its `new_ip`.
  A retired machine's `new_ip` is where its workload was *said* to be going, which
  is precisely the claim being corrected.
- Trashing the source also resets its `new_ip` to its `old_ip`. The machine did
  not migrate anywhere, and left alone that stale value draws a phantom "Migrated
  from" row on whichever VM's address it named.

**Removing an address never removes a URL.** `endpoints.ip_id` is
`on delete set null`, so its endpoints fall back to the primary — visible and
correctable rather than silently gone. That is also why deleting an address is
editor work rather than admin work.

**The projects pages resolve it per record too.** A project page shows each
record's direct address (`ip:port`), and after a move that address is the one that
came with the record, not the machine's own — so the environment row would
otherwise print a host those endpoints have never answered on.

`ip_id` therefore travels into the projects slice: every select that embeds a VM
uses `VM_SUMMARY_EMBED` (`repositories/vms/vmRepository.ts`), which pulls
`vm_ips(id, address)` along with it, and `rowToPort` resolves each record's
`ipAddress` from it. `Environment.vmIp` stays the *machine's* address and is the
fallback; `recordAddress` in [lib/endpoints.ts](../lib/endpoints.ts) is the one
place the pair is resolved, shared by the record's link, the environment header
(which lists every address its records use) and the docs generator.

Empty `ipAddress` means the machine's own address — what every record meant before
this existed — so nothing that predates it changed. The one place still showing
the machine's address alone is the **project list's hover summary**, which has no
records loaded and is describing the machine rather than an endpoint.

## The grid's columns are fixed, and rows start open

`COLUMNS` in `vm-tracker.tsx` declares each column's label **and** its width, the
table is `table-fixed` with a matching `<colgroup>`, and the widths' sum is the
table's `min-width`. With the browser's automatic layout the grid sized itself to
its content: expanding a VM introduced long URLs, every column re-flowed, and the
UPVIEW and Client tables stopped lining up with each other — the page appeared to
jump as rows opened and closed. Text that no longer fits is clipped rather than
allowed to widen a column.

**The page opens with every VM collapsed.** 14 VMs with 48 URLs between them is
more than a screen of rows before you have chosen what to look at, so each row
starts closed and the chevron (or Expand All) opens it. `expanded` is forced off
as the payload is mirrored into local state rather than read from the row: it is
view state — the chevron and both bulk buttons are local — so the page always
starts from the same place instead of from whatever was left open last time.

## Jenkins is a property of the VM

A VM runs one Jenkins, so each VM row carries a `J` marker that is also the form
behind it: server address, username, API token, stored in
[`vm_jenkins` / `vm_jenkins_secrets`](./schema.md#vm_jenkins--vm_jenkins_secrets).
Three states — filled (server + token), outlined (server, no token yet), plain
(not set up). The address only needs the machine's host: `http://` and port 8080
are filled in.

Environments deployed on the VM use that server and those credentials and add
only their own job, so the same three values are no longer typed once per
environment. See [jenkins-sync.md](./jenkins-sync.md#where-jenkins-is-configured).

**The dialog also tests the connection.** "Test connection" asks the server the
smallest authenticated question it answers (`/api/json?tree=mode`), and a save
runs the same check automatically before closing — so a wrong token surfaces
where it was typed instead of as a failed port sync on some environment hours
later. Each failure reports the thing that is actually wrong: address unreachable,
credentials rejected (401/403), no Jenkins API at that path (404), or the status
it answered with. It can test what is typed *before* saving, and re-test the
stored configuration afterwards — which is the only way to verify a token, since
the browser never receives one.

Editors get the form; **viewers still see the marker** — which machines run
Jenkins is not a secret, and the token never leaves the server either way
(`hasToken` is a boolean in every payload).

## Groups

VMs are grouped by client or provider: `EUKHOST-STRATEGIZER`, `EUKHOST-ROCKLAND`
and `EUKHOST-IMA` are one fleet, and the flat grid said nothing about that. A
group is the missing parent — **one group, many VMs**, via `vms.group_id` (see
[`vm_groups`](./schema.md#vm_groups)).

**Selecting.** Every VM row carries a tick in the same gutter as its expand
chevron, and the gutter's column header ticks the whole section. The tick is
editor+ only — every action on a selection is a write, so a viewer gets no
control whose every outcome is hidden. Selection is view state and is never
persisted: it is a gesture in progress, not a fact about a machine.

**Acting.** With anything ticked, a floating bar appears at the bottom of the
viewport (the grid is long, so the actions have to stay reachable from wherever
the last tick was made). It offers an existing group, `New group…` — which
creates the group and files the selection into it in one gesture — or **Remove
from group**. The whole selection moves in a single `update … in (ids)`
statement, so it either all lands or none of it does.

**Rendering.** Both views render their sections split by group, ungrouped last
(`groupVms` in `lib/vm-utils.ts`). The grid draws a full-width band above each
group's rows rather than indenting them: the table is 1800px wide and scrolls
sideways, and an indent would be off-screen exactly when you need to know which
group you are looking at. Group headers only appear once something in *that*
section is grouped, so an all-ungrouped section looks exactly as it always did.
A group whose VMs all sit on the other side of the UPVIEW/Client split draws no
header there — the full group list still reaches the bar's menu, which is what
keeps an empty group reachable.

**Deleting a group ungroups its VMs.** The FK is `on delete set null`; no VM,
URL or migration data is touched. That is why it is editor-level work and why
the confirm dialog says so.

**The groups ride in the tracker payload** (`GET /api/vms` returns
`{ vms, deleted, groups }`) rather than in a query of their own, so one load has
everything the grid needs — including the empty groups, which have no VM to
arrive with. The replace-all import replaces groups too, remapping each VM's
`groupId` onto the freshly created rows; a backup written before groups existed
has none and imports as an ungrouped tracker.

## The archive is permanent

**Nothing in the app can permanently delete a VM.** Not an editor, not an admin,
not a hand-crafted request — `vms` has no delete policy at all, so Postgres
refuses it for every signed-in session
(`…_vms_are_never_deleted_by_a_session.sql`).

A VM row is the only record that a machine existed: what it was called, the
addresses it answered on, what migrated onto it, which endpoints it served. The
old **Delete** button sat on each trashed row and **Clear all** on each list, both
guarded by a `confirm()` — and a confirm dialog does not catch the mistake that
actually happens, which is acting on the wrong row. Trashing already removes a
machine from the grid, which is all "deleted" needs to mean day to day.

So the trash is an **archive**: rows are kept indefinitely, `Restore` brings one
back, and the section header says so. The icon is an archive box rather than a
bin, and the column reads *Archived At*.

Removing one for real is a **database-level act** — the Supabase SQL editor, or
the service-role key, both of which bypass RLS. That is the point: it is done
where you can see exactly what you are about to destroy.

**One exception, and it is deliberate:** the admin-only replace-all import has to
clear the table before it can restore a backup over it. It does that through
`deleteAllVmsForImport`, the one service-role call in `vmRepository`, behind
`requireAdmin` in `importTracker` — which is therefore the only gate in front of
it. See [security.md](./security.md#service-role-paths-are-the-load-bearing-ones).

## Permissions

The tracker is **read-only for viewers**. Three roles, enforced in three places
(see [auth.md](./auth.md#where-access-is-enforced)):

| Action                                            | Minimum role |
| ------------------------------------------------- | ------------ |
| View the grid and the archive, expand/collapse, Export | `viewer` |
| Add / edit a VM or URL, archive one, restore it   | `editor`     |
| Add / edit / remove an address, move one between VMs | `editor`  |
| Select VMs, create/rename/delete a group, group or ungroup VMs | `editor`     |
| Replace-all import                                | `admin`      |
| **Permanently delete a VM**                       | **nobody — see [The archive is permanent](#the-archive-is-permanent)** |

- **RLS** is authoritative — see [`vms`](./schema.md#vms),
  [`endpoints`](./schema.md#endpoints), [`vm_ips`](./schema.md#vm_ips) and
  [`vm_groups`](./schema.md#vm_groups).
- **`vmService`** (and **`vmGroupService`**) re-checks the role on every mutation and throws
  `ForbiddenError` (`lib/errors.ts`), which the routes turn into a 403 via
  `isForbidden`. This is what produces a readable message instead of a raw
  policy-violation error.
- **The UI** hides what the role can't do: `tracker/page.tsx` resolves the role
  server-side and passes it to `VmTracker`, which derives `canWrite`
  (`canEdit`) and `canImport` (`isAdmin`). A viewer gets plain text cells, static
  Yes/No pills, no action buttons, and a "Read-only" badge in the header.
  Expand/collapse stays live for everyone — it is local view state, not data.

Hiding a control is an affordance, never the boundary: the service and RLS both
still reject the request.

## API

All routes require an authenticated session and return `{ data }` or
`{ error }`. Mutations answer **403** when the session's role is too low.

| Method + path                       | Action                               | Role     |
| ----------------------------------- | ------------------------------------ | -------- |
| `GET  /api/vms`                     | full payload `{ vms, deleted, groups }` | `viewer` |
| `POST /api/vms`                     | create a VM                          | `editor` |
| `PATCH  /api/vms/:id`               | update VM fields                     | `editor` |
| `DELETE /api/vms/:id`               | archive (soft delete) — **the only delete the API has** | `editor` |
| `POST /api/vms/:id/restore`         | restore from the archive             | `editor` |
| `POST /api/vms/:id/urls`            | add a **VM-owned** URL row           | `editor` |
| `PATCH  /api/vms/:id/urls/:urlId`   | update a URL row (`ipId` moves it to another of the VM's addresses) | `editor` |
| `DELETE /api/vms/:id/urls/:urlId`   | delete a URL row — **400** on a project's record (delete it from the project) | `editor` |
| `POST /api/vms/:id/ips`             | give the VM another address          | `editor` |
| `PATCH  /api/vms/:id/ips/:ipId`     | edit one of its extra addresses      | `editor` |
| `DELETE /api/vms/:id/ips/:ipId`     | remove one — its URLs fall back to the primary | `editor` |
| `POST /api/vms/:id/ips/move`        | take another VM's address: address + its URLs + trash the source, in one call | `editor` |
| `POST /api/vms/import`              | replace-all from a backup (groups included) | `admin`  |
| `GET  /api/vm-groups`               | every group (the grid reads them from the tracker payload instead) | `viewer` |
| `POST /api/vm-groups`               | create a group                       | `editor` |
| `PATCH  /api/vm-groups/:id`         | rename a group / edit its notes      | `editor` |
| `DELETE /api/vm-groups/:id`         | delete a group (its VMs are ungrouped) | `editor` |
| `POST /api/vm-groups/assign`        | file `{ vmIds }` under `{ groupId }`, or ungroup with `null` | `editor` |

## Behavior notes

- **Local-first editing.** `vm-tracker.tsx` mirrors the loaded payload into
  local state so typing is instant with no per-keystroke requests: text fields
  persist on blur, toggles/structural changes persist immediately. The query
  only re-syncs local state on initial load and after an explicit refetch (an
  import, or an address move), so in-progress edits are never clobbered.
- **`migrated_archive` is historical.** It was written by the old
  purge-with-archive path, which existed because purging destroyed the source
  row. Nothing writes it now except a backup import carrying one back in — the
  source VM's own row is the record. The grid still reads it, so entries written
  before the change keep rendering with their `ARCHIVED` tag.
- **Migrated-from display** is derived on the client: a VM that is the
  "primary" destination for its IP (`old_ip === new_ip`) shows the active,
  trashed, and archived source VMs that migrated onto it.
- **Shared data.** There is no per-user ownership: every signed-in user sees the
  same rows, matching the original single-shared-file tool. Who may *change*
  them is role-based — see [Permissions](#permissions).
