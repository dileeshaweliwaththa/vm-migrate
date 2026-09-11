# Database Backups

The **Backups** tab is where the team's MySQL backups are configured, scheduled
and watched.

Supabase holds the configuration and the credentials, and pg_cron runs the
schedule. The dumping itself belongs to `upview-db-backup-tracker` — a
Node/Express worker that shells out to `mysqldump`, gzips the result, ships it to
Azure Blob Storage and keeps a local history — which the portal reads through to
for status and past runs.

Two systems, one control plane. [Jenkins](./jenkins-sync.md) is the same idea
from the other end: there, the other system owns the truth and we hold an address;
here, we own the truth and the other system does the work.

## Layers

| Layer      | Files                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| Routing    | `app/(protected)/(app)/backups/page.tsx` (the index), `backups/[id]/page.tsx` (one target) — both resolve the role; `app/api/backups/**/route.ts` |
| UI         | `components/backups/backups-index.tsx`, `backup-target-detail.tsx`, `backup-stat-cards.tsx`, `backup-database-picker.tsx`, `backup-log-panel.tsx`, `backup-history.tsx`, `backup-target-dialog.tsx` |
| Hook       | `hooks/backups/useBackups.ts`                                                             |
| Service    | `services/backups/backupService.ts`                                                        |
| Repository | `repositories/backupTargets/backupTargetRepository.ts` (Supabase), `backupTargetSecretRepository.ts` (**service-role**), `repositories/backups/backupApiRepository.ts` (**external HTTP**) |
| Scheduling | `supabase/functions/backup-dispatch/index.ts` (Edge Function), `…_backup_schedule_cron.sql` (pg_cron + the sync function) |

Presentation helpers (`formatBytes`, `formatDuration`, `recordTone`,
`computeBackupStats`, `groupRecordsByDay`, `hasDuplicateSchedule`,
`hasHostMismatch`) live in
`lib/backup-utils.ts`; domain types in `types/common/backup.ts`; row types in
`types/supabase/response/backupTargets`.

`backupApiRepository` is the app's **second** external-HTTP data source, after
`jenkinsRepository` — the documented exception to "repositories only touch
Supabase" (architecture.md / AGENTS.md). Like the first, it builds requests,
reports what came back, and decides nothing: no call throws, because a backup
host that is down, renamed or firewalled is an ordinary outcome the page has to
render rather than an exception to bubble up as a 500.

## Why a target names a worker

The portal cannot dump a database: there is no `mysqldump` in a Next.js route and
no disk to write 64MB to. The worker container is what performs the dump, the
gzip and the Azure upload, and it is what this app reads status, the database
list, the history and the live log stream from, and posts a run to. So a target
has to say where that container is.

It cannot be derived, either: the worker runs wherever it was deployed
(`20.197.41.68:2999`) and the database it backs up is somewhere else entirely
(`mencartdb.mysql.database.azure.com`). What the form does instead is stop asking
twice — a new target's worker address is **prefilled from an existing target**,
since one container normally dumps every database.

## What lives where

**Supabase owns the configuration, the credentials and the schedule. The worker
container owns the dumping.** That split is not a preference:

| | Where | Why |
| --- | --- | --- |
| Config (host, port, user, Azure account/container, retention) | `backup_targets` | one place to add the next database |
| Credentials (DB password, Azure connection string) | `backup_target_secrets` — RLS on, **no policies**, service-role only | never in a `.env` on a box, never sent to a browser |
| Schedule | `backup_targets.cron_schedule` → **pg_cron** | the column *is* the schedule, not a description of one |
| The dump itself | the worker container | see below |

### Why the dump is not an Edge Function

Edge Functions give **400s of wall clock but 2s of CPU time and 256MB of
memory**, with no `mysqldump` binary and no persistent disk. `tourcan-prod` alone
is 64.5 MB and takes 245s of real work, and a run covers 18 databases. Building
dump SQL and gzipping it in Deno is pure CPU, so the cap is hit almost
immediately — and re-implementing mysqldump (views, triggers, charsets, foreign
key ordering) would trade a performance problem for a correctness one.

So Supabase takes the parts it is good at, and the container keeps the part it is
good at.

## Scheduling

```
pg_cron  (one job per target, its own cron expression)
  └─ net.http_post → supabase/functions/backup-dispatch
       └─ POST worker /api/backup {databases: []}   ← fired, not awaited
            └─ mysqldump → gzip → Azure Blob
  └─ backup_dispatches row: we asked, at this time, and it was accepted
```

- **One job per target**, created and replaced by
  `public.sync_backup_target_schedule(uuid)`, which a trigger on
  `backup_targets` calls whenever `cron_schedule`, `schedule_enabled` or
  `worker_url` changes (and on delete). No code path can change a schedule
  without the schedule changing.
- The function's **URL and service-role key are read from Vault inside the job
  command**, not baked into it, so rotating either is not a rewrite of every job.
- The Edge Function **does not wait for the dump.** The worker answers
  `POST /api/backup` only when every database is done — tens of minutes — so the
  request is handed to `EdgeRuntime.waitUntil` and the function answers 202. A
  dispatch timeout is therefore the *expected* outcome of a healthy run, and is
  recorded as dispatched rather than as a failure.
- **A target is dispatched as one "all databases" request**, not one per
  database: the worker runs a single backup at a time by design and answers 409
  to the rest.
- `backup_dispatches` exists because the worker can tell us the *outcome* of a
  run but not whether it was ever *asked for* — a schedule that stopped firing
  looks exactly like a schedule with nothing to do. The card shows "last asked",
  and says so explicitly when an enabled schedule has never fired.

### One-time setup per project

```bash
supabase db push
supabase functions deploy backup-dispatch
```

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/backup-dispatch',
  'backup_dispatch_url'
);
select vault.create_secret('<service-role-key>', 'backup_dispatch_key');
-- re-sync so the jobs pick the secrets up
select public.sync_backup_target_schedule(id) from public.backup_targets;
```

The function needs no secrets of its own: `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected by the platform, and `verify_jwt` (the
default) is what stops anything but pg_cron's service-role call from invoking it.

## The gap this leaves

The worker still reads its **own** `.env` for the MySQL host, password, Azure
connection string and retention, so those facts exist twice and the worker's copy
is the one that decides what gets dumped. Until
[#90](https://github.com/kodplex/upview-vm-tracker/issues/90) rewires it, the
portal's job is to make a disagreement visible rather than to pretend there
isn't one — a card warns when:

- the worker reports a different `db_host` than the target says (`hasHostMismatch`);
- the worker's own `node-cron` is still enabled alongside the Supabase schedule
  (`hasDuplicateSchedule`) — two schedulers, two nightly runs of the same dumps.
  The **Worker cron** toggle on the card is how you turn that one off.

## Two levels, like Projects

`/backups` is a **grid of target cards**; `/backups/[id]` is where the work
happens. The first cut stacked every target's stat cards, database picker, log
panel and 200-row history on one page — which worked for exactly one target and
ran out of screen at two.

A **card** answers only "is this database being backed up, and is anything
wrong": the worker's state, the last dump, the schedule, the counts, and a
warning badge for the two misconfigurations that hide themselves. The counts are
chips — mono, `rounded-sm`, on the muted fill — the same treatment the project
card gives *3 environments*, so the two grids read as one system. `3 failed` and
`2 local only` appear only when they are not zero, in their own tone. The whole card
is a link, the same as a project card, and hover shifts the border rather than the
shadow.

The **breadcrumb** resolves the target's name through the same query key the
detail page uses, so it shares that request instead of making a second one —
exactly how the project crumb works.

## What a target's page shows

**Two views, switched in place** — the same `ToggleGroup` the project page uses
for Environments / Documentation:

- **Overview** — the numbers, what to dump, the live log, and the configuration
  read-back.
- **History** — every recorded dump, grouped by day. Its nine columns under
  everything else made the page a scroll rather than a screen.

The header carries the two facts that tell you you are in the right place — the
database and the schedule — and nothing else. The worker's address, retention,
the Azure destination and which credentials are stored are *configuration*: they
sit in a quiet strip at the end of Overview and in the Edit dialog, not in a
sentence across the top of every visit. The body runs to `max-w-[100rem]`, not
`max-w-7xl`: `PageHeader` extends to the page's own padding, so a narrower body
left a gutter down both sides that read as a mistake.

Overview, in the order the questions come in:

1. **Four stat cards** — backups recorded, last backup (with its status, trigger
   and database), databases on the server, and the worker's state (`Online` /
   `Backing up` / `Unreachable`). Composed from `Card` on the muted surface so a
   row of them reads as a panel inside the target card rather than four more
   cards.
2. **Select databases** — every database as a chip (`ToggleGroup type="multiple"`,
   which styles on `data-[state=on]` and so survives radix-ui 1.4.3), with
   **Select all** / **Clear**. Nothing ticked means *all*, which is the worker's
   own default for a missing list, so the button says which of the two it is
   about to do. The selection clears after a successful run — it was for that
   run, and leaving it ticked would silently narrow the next one.
3. **Backup logs** — always present, with a `Ready` / `Running` badge and an
   empty state, so there is somewhere for a run to appear and somewhere to read
   it afterwards. It follows the tail and colours failures.

   ### Where a run's progress actually comes from

   The worker has two log channels and only one of them can be relied on:

   | | What it is | Reality |
   | --- | --- | --- |
   | `GET /api/backup/events` | Server-Sent Events, pushed per step | **the live channel** — proxied by `GET /api/backups/:id/stream` and consumed with `EventSource` (`useBackupStream`) |
   | `GET /api/backup/logs?since=` | the same steps, replayed from the worker's MySQL | best-effort: `saveEvent` is fire-and-forget and a failed insert is a warning on the worker's console, so where those tables are missing it answers 200 with an empty list forever |

   So the replay seeds the panel and the stream appends to it. The stream stays
   attached whenever the worker is reachable — not only while a run is in flight
   — so a nightly run that starts with the page open fills in by itself.

   **The events carry no message and no timestamp.** A step is structured:
   `{ type: 'db_dump', database: 'tourcan-prod', index: 3, total: 18 }`. The
   sentences in the worker's console are formatted from the type at print time,
   so this side does the same in `describeBackupEvent` — and the clock is ours,
   stamped when the line arrives (`receivedAt`). A step type this app has never
   heard of still prints, as the type plus its database.

   The stream is proxied rather than subscribed to from the browser for the same
   reasons the download is: the worker is on an address the browser may not
   reach, and its API has no authentication of its own. `X-Accel-Buffering: no`
   on the response is what stops a proxy holding the lines until the stream ends
   — which, for a subscription that never ends, means showing nothing.
The **History** view: **grouped by day and collapsed.** The worker keeps its 200
The worker keeps its 200 most recent records and a nightly run covers eighteen
databases, so a flat table is a fortnight of near-identical rows. A day collapses
to one line — *Wed 13 May · 18 dumps · 214 MB · All uploaded* — which is the check
you actually make. Open it when it isn't all fine.

The day line is a **grid**, not a flex row — with flex, each day's date decided
where its "18 dumps" began and no two lines agreed on a column — and the counts
use `tabular-nums` so the digits line up too.

The day's verdict is green only when every dump succeeded **and** every one
reached Azure; otherwise it names what went wrong (`3 failed`, `2 local only`).

**Every day starts open**, with `Collapse all` / `Expand all` beside `Refresh`.
The state tracks which days are *closed* rather than which are open: seeding an
open-set from the records was a bug as well as a default — it was computed on the
first render, before the fetch resolved, so there were no days to seed from and
nothing ever opened. Tracking the closed ones means a day from a later fetch
arrives open, with no data to derive state from. Collapsing is local state on a
plain chevron button, the same as the VM tracker's rows rather than another Radix
primitive.

Inside a day: database, filename, time, size, duration, trigger, status, Azure and
the per-row actions. `Refresh` re-reads the history from the worker.

Per-row actions, each offered only where it can do something:

| Action | When | Role |
| --- | --- | --- |
| **Download** the dump | always | `editor` |
| **Upload to Azure** | the dump succeeded but never reached Azure | `editor` |
| **Delete** the dump | always | `admin` |

`Azure` is its own column because "uploaded" is a different fact from
"succeeded", and the gap between them is the one worth acting on — a dump that
exists only on the worker's disk is one host failure from being gone.

### Downloading goes through the portal

`GET /api/backups/:id/records/:recordId/download` proxies the worker and
**streams** the body (these are 64MB gzipped dumps — nothing is buffered). It is
not a direct link to the worker, because the worker sits on an internal address
the browser may not reach and its API has no authentication of its own: proxying
means the download inherits this app's session and role check.

It is **editor+**, one step above the rest of reading, which is a deliberate
exception to "everyone reads everything" ([A5](./security.md#accepted-risks)):
every other thing on this page is metadata *about* a backup, while this is the
database contents — every row of every table, in one click. A viewer can still
see that a backup exists and succeeded.

## Permissions

Three roles, the same line the tracker draws (see
[auth.md](./auth.md#where-access-is-enforced)):

| Action                                                        | Minimum role |
| ------------------------------------------------------------- | ------------ |
| See the targets, their status, databases, history and logs    | `viewer`     |
| **Download** a dump — the database contents, not just metadata | `editor`    |
| Register or edit a target (host, user, credentials, Azure, retention), **run a backup**, re-upload a dump to Azure | `editor` |
| Change the **schedule**, delete a dump, remove a target, toggle the worker's own cron | `admin` |

A run is additive — it only ever creates a dump — so it sits at editor. The
admin-only set is what loses something or changes *when* backups happen: a
deleted dump is gone from the host, a removed target means a database stops being
backed up, and a schedule switched off is how backups quietly stop.

The schedule travels in the same payload as the rest of the configuration, so
`updateBackupTarget` raises the bar to admin **when a schedule field is present**
rather than trusting a separate route nobody would notice was unguarded.

`backupService` re-checks the role on every one of those and throws
`ForbiddenError`, which the routes turn into a 403. Hiding a control is an
affordance, never the boundary.

## API

All routes require an authenticated session and answer `{ data }` or
`{ error }`.

| Method + path                                     | Action                                        | Role     |
| ------------------------------------------------- | --------------------------------------------- | -------- |
| `GET  /api/backups`                               | every target with status, databases, history  | `viewer` |
| `POST /api/backups`                               | register a target                             | `editor` |
| `GET  /api/backups/:id`                           | one target's overview (refresh a single card) | `viewer` |
| `PATCH  /api/backups/:id`                         | edit config/credentials (`editor`); schedule fields need `admin` | `editor` |
| `DELETE /api/backups/:id`                         | remove the target + its credentials + its cron job | `admin` |
| `GET  /api/backups/:id/logs?since=N`              | a run's progress, replayed from the worker's DB (best-effort) | `viewer` |
| `GET  /api/backups/:id/stream`                    | live progress, proxied as Server-Sent Events  | `viewer` |
| `POST /api/backups/:id/run`                       | dump now (`{ databases: [] }` = all)          | `editor` |
| `POST /api/backups/:id/cron`                      | `{ enabled }` — the **worker's own** node-cron | `admin`  |
| `POST /api/backups/:id/records/:recordId`         | re-upload that dump to Azure                  | `editor` |
| `GET  /api/backups/:id/records/:recordId/download`| stream that dump to the browser               | `editor` |
| `DELETE /api/backups/:id/records/:recordId`       | delete that dump on the host                  | `admin`  |

### The service's own API, for reference

`GET /api/status`, `GET /api/databases`, `GET /api/backups`, `POST /api/backup`,
`GET /api/backup/logs?since=`, `POST /api/backups/:id/upload`,
`DELETE /api/backups/:id`, `POST /api/cron/toggle`, and an SSE stream at
`GET /api/backup/events`.

Two of those need care and get it in the service layer:

- **`POST /api/cron/toggle` takes no argument** — it flips whatever the current
  state is. Our route takes the state you *want*, so `setCronEnabled` reads the
  status first and calls the toggle only when the two disagree. Two clicks racing
  each other would otherwise leave the schedule wherever they landed.
- **`POST /api/backup` answers only when the dump has finished**, which can take
  minutes. It gets a longer timeout than every other call, and the page follows
  progress through the log endpoint instead of waiting on it.

## How a run is followed

Polling, not the SSE stream: the portal follows Jenkins builds the same way, one
mechanism is easier to reason about than two, and a poll survives the proxies
between here and a backup host. `useBackupLogs` runs at 2s while a run is in
flight and not at all otherwise — and "in flight" includes a run *this* browser
didn't start, since `GET /api/status` reports `isBackupRunning`, so a cron run or
a colleague's manual run streams into the card too.

## What the page tells you

- **Reachable, as text.** A service that cannot be reached returns an overview
  with `status.reachable = false` and the reason, not an error — the histories of
  the *other* services are still worth showing, and this one's history is what is
  unavailable, not the page.
- **"Local only".** A dump that succeeded but never reached Azure is its own
  state, counted in the header and shown on the row: the file exists, the
  off-site copy doesn't. That row is the only one offered the re-upload button.
- Sizes, durations and timestamps are mono, because they are scanned down a
  column. Every status pill renders its state as text — no meaning rests on
  colour alone (see [ui-guidelines.md](./ui-guidelines.md#status-tones)).
- History is capped by the service at its 200 most recent records, so the counts
  in the header are "recent", not "ever".

## Security

**The credentials.** The MySQL password and the Azure connection string live in
`backup_target_secrets`: RLS on with **no policies**, so no authenticated client
can read or write it — only server code, via the service-role client, behind an
editor check. Neither value is ever sent to a browser; the UI is told
`hasDbPassword` / `hasAzureConnection` and nothing more, and a blank field on
save means "keep the stored one" (the form was never given it to resend). Same
construction as `vm_jenkins_secrets` and `environment_secrets`.

**The worker's API is unauthenticated**: its `/api/auth/login` gates its own web
UI only, every `/api/*` route is open, and `cors()` is on. So:

- anyone who can reach the worker's host can already trigger or delete backups
  without the portal;
- the portal does not widen that, but it does put a button in front of it, gated
  by the RBAC above;
- fixing it belongs in the worker — a token on the mutating routes, stored here
  the way the other credentials are ([#90](https://github.com/kodplex/upview-vm-tracker/issues/90)).

That is recorded as an accepted risk in
[security.md](./security.md#accepted-risks). Every outbound call passes
`isDeniedOutboundTarget` (`lib/outbound-url.ts`) — the same host denylist the
Jenkins integration uses — and it is checked **on every call**, not only when the
URL is saved: a row written before a rule tightened is not a reason to fetch it.
