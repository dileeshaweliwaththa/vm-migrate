# VM Migration Tracker

The tracker is the app's main feature and the reference example of a full
vertical slice through all five layers (see [architecture.md](./architecture.md)).

## Layers

| Layer      | Files                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Routing    | `app/(protected)/tracker/page.tsx`, `app/api/vms/**/route.ts`                                   |
| UI         | `components/vms/vm-tracker.tsx`, `vm-row.tsx`, `vm-trash.tsx`, `yes-no-toggle.tsx`               |
| Hook       | `hooks/vms/useVmTracker.ts` (TanStack Query query + mutations)                                   |
| Service    | `services/vms/vmService.ts` (mapping, soft delete, purge-with-archive, import)                   |
| Repository | `repositories/vms/vmRepository.ts`, `repositories/vmUrls/vmUrlRepository.ts`                     |

Presentation helpers (`buildFullUrl`, `safeStatus`, `computeStats`) live in
`lib/vm-utils.ts`; shared domain types in `types/common/vm.ts`; raw row types
in `types/supabase/response/{vms,vmUrls}`.

## API

All routes require an authenticated session and return `{ data }` or
`{ error }`.

| Method + path                       | Action                               |
| ----------------------------------- | ------------------------------------ |
| `GET  /api/vms`                     | full payload `{ vms, deleted }`      |
| `POST /api/vms`                     | create a VM                          |
| `PATCH  /api/vms/:id`               | update VM fields                     |
| `DELETE /api/vms/:id`               | soft delete (to trash)               |
| `POST /api/vms/:id/restore`         | restore from trash                   |
| `DELETE /api/vms/:id/purge`         | permanent delete (+ archive URLs)    |
| `POST /api/vms/:id/urls`            | add a URL row                        |
| `PATCH  /api/vms/:id/urls/:urlId`   | update a URL row                     |
| `DELETE /api/vms/:id/urls/:urlId`   | delete a URL row                     |
| `DELETE /api/vms/trash?type=…`      | empty one trash list (`upview`/`client`) |
| `POST /api/vms/import`              | replace-all from a backup            |

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
- **Shared data.** All authenticated users read/write the same rows (RLS grants
  full access to `authenticated`), matching the original single-shared-file
  tool.
