# VM Migration Tracker

The tracker is the app's main feature and the reference example of a full
vertical slice through all five layers (see [architecture.md](./architecture.md)).

## Layers

| Layer      | Files                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Routing    | `app/(protected)/(app)/tracker/page.tsx` (resolves the role), `app/api/vms/**/route.ts`          |
| UI         | `components/vms/vm-tracker.tsx`, `vm-row.tsx`, `vm-card.tsx`, `vm-fields.tsx`, `vm-view-toggle.tsx`, `vm-trash.tsx`, `yes-no-toggle.tsx` |
| Hook       | `hooks/vms/useVmTracker.ts` (TanStack Query query + mutations)                                   |
| Service    | `services/vms/vmService.ts` (mapping, soft delete, purge-with-archive, import)                   |
| Repository | `repositories/vms/vmRepository.ts`, `repositories/vmUrls/vmUrlRepository.ts`                     |

Presentation helpers (`buildFullUrl`, `safeStatus`, `migratedSources`,
`computeStats`) live in `lib/vm-utils.ts`; shared domain types in
`types/common/vm.ts`; raw row types in `types/supabase/response/{vms,vmUrls}`.

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

The toggle is **layout, so every role gets it** — including viewers, who see the
same read-only treatment in either shape.

## Permissions

The tracker is **read-only for viewers**. Three roles, enforced in three places
(see [auth.md](./auth.md#where-access-is-enforced)):

| Action                                            | Minimum role |
| ------------------------------------------------- | ------------ |
| View the grid and trash, expand/collapse, Export  | `viewer`     |
| Add / edit a VM or URL, move to trash, restore    | `editor`     |
| Permanent delete, empty trash, replace-all import | `admin`      |

- **RLS** is authoritative — see [`vms`](./schema.md#vms) and
  [`vm_urls`](./schema.md#vm_urls).
- **`vmService`** re-checks the role on every mutation and throws
  `ForbiddenError` (`lib/errors.ts`), which the routes turn into a 403 via
  `isForbidden`. This is what produces a readable message instead of a raw
  policy-violation error.
- **The UI** hides what the role can't do: `tracker/page.tsx` resolves the role
  server-side and passes it to `VmTracker`, which derives `canWrite`
  (`canEdit`) and `canPurge` (`isAdmin`). A viewer gets plain text cells, static
  Yes/No pills, no action buttons, and a "Read-only" badge in the header.
  Expand/collapse stays live for everyone — it is local view state, not data.

Hiding a control is an affordance, never the boundary: the service and RLS both
still reject the request.

## API

All routes require an authenticated session and return `{ data }` or
`{ error }`. Mutations answer **403** when the session's role is too low.

| Method + path                       | Action                               | Role     |
| ----------------------------------- | ------------------------------------ | -------- |
| `GET  /api/vms`                     | full payload `{ vms, deleted }`      | `viewer` |
| `POST /api/vms`                     | create a VM                          | `editor` |
| `PATCH  /api/vms/:id`               | update VM fields                     | `editor` |
| `DELETE /api/vms/:id`               | soft delete (to trash)               | `editor` |
| `POST /api/vms/:id/restore`         | restore from trash                   | `editor` |
| `DELETE /api/vms/:id/purge`         | permanent delete (+ archive URLs)    | `admin`  |
| `POST /api/vms/:id/urls`            | add a URL row                        | `editor` |
| `PATCH  /api/vms/:id/urls/:urlId`   | update a URL row                     | `editor` |
| `DELETE /api/vms/:id/urls/:urlId`   | delete a URL row                     | `editor` |
| `DELETE /api/vms/trash?type=…`      | empty one trash list (`upview`/`client`) | `admin`  |
| `POST /api/vms/import`              | replace-all from a backup            | `admin`  |

## Behavior notes

- **Local-first editing.** `vm-tracker.tsx` mirrors the loaded payload into
  local state so typing is instant with no per-keystroke requests: text fields
  persist on blur, toggles/structural changes persist immediately. The query
  only re-syncs local state on initial load and after an explicit refetch
  (purge / clear-trash / import), so in-progress edits are never clobbered.
- **Purge-with-archive.** Permanently deleting a VM whose URLs were migrated
  onto a destination copies those URLs into the destination's
  `migrated_archive` (jsonb) first — mirrored in the "Migrated from" rows.
- **Migrated-from display** is derived on the client: a VM that is the
  "primary" destination for its IP (`old_ip === new_ip`) shows the active,
  trashed, and archived source VMs that migrated onto it.
- **Shared data.** There is no per-user ownership: every signed-in user sees the
  same rows, matching the original single-shared-file tool. Who may *change*
  them is role-based — see [Permissions](#permissions).
