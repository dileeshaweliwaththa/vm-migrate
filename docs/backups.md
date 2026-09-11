# Database Backups

The **Backups** tab is where the team's MySQL backups are configured, scheduled,
run and inspected. All of it is this app:

```
pg_cron (per target, its own cron expression)
  └─ POST /api/backups/cron          shared-token auth; pg_cron has no session
       └─ backupRunner
            mysqldump (stdout) → gzip → Azure Blob uploadStream
            └─ backup_runs / backup_run_events      the history and the log
```

**Nothing touches disk**, and there is no worker container. The three stages are
pipes, so a 64MB database costs a few megabytes of memory rather than 64 of them
plus a file to clean up afterwards.

## How it got here, and why the runner lives in the app

The first version called out to `upview-db-backup-tracker`, a separate
Node/Express container, because a Supabase **Edge Function** cannot dump a
database: 2s of CPU, 256MB of memory, no `mysqldump`, no disk. That limit is
real, and it is the whole reason the feature started with an external worker.

It does not apply to **this app**. The portal is a long-lived Node process in a
container we build, so it can carry `mysqldump` (Alpine's `mysql-client`, added
to the runner stage of the [Dockerfile](../Dockerfile)) and run for as long as a
dump takes. Once that was clear the worker was pure cost: a second deployment, a
second copy of the credentials, an HTTP hop that could be unreachable, and a
local file written before every upload.

What the worker left behind:

- `backup_targets.worker_url` is **legacy**. Nothing writes it, no form asks for
  it, and it is read only so an older row is not silently lost. The same is true
  of `azure_account` / `azure_container` and
  `backup_target_secrets.azure_connection_string`, superseded by the shared
  destination above.
- The `backup-dispatch` Edge Function and its `backup_dispatch_*` Vault secrets
  are gone; the schedule posts to this app directly.

## Azure storage is configured once

A **destination** is its own record — `backup_storage_accounts` (name, account,
container) plus `backup_storage_secrets` (the connection string, service-role
only) — managed from the **Azure Storage** button on the Backups page, with a
**Test** that lists the container.

It used to be three fields and a key on every target, which meant entering the
same account twice for the second database and rotating the key in as many places
as there were targets. A target now *picks* one.

Because one container is shared, **each target writes under its own prefix**:
`<container>/<target prefix>/<database>/<database>_<timestamp>.sql.gz`. Retention
deletes by age *within* that prefix — without it, one target's seven-day policy
would delete another's dumps. The prefix is derived from the target's name once,
at creation, and then fixed: renaming a target must not orphan the blobs already
written under the old one.

Removing a destination leaves its targets without one (`on delete set null`) and
**deletes no blobs**.

## What a target is

One MySQL **server** —
[`backup_targets`](./schema.md#backup_targets--backup_target_secrets--backup_dispatches).
Four things, and nothing else:

| | |
| --- | --- |
| Connection | `db_host`, `db_port`, `db_user` + the password in `backup_target_secrets` |
| Retention | `retention_days` — blobs older than this are deleted from its prefix after each run |
| Destination | `storage_id` → a shared `backup_storage_accounts` row |
| Schedule | `cron_schedule`, `schedule_enabled` → a pg_cron job |

`db_name` is deliberately absent: the runner asks the server what databases it
has and dumps each one, which is why "18 databases" is a property of the server
rather than 18 rows here.

**The database password lives in `backup_target_secrets`** — RLS on with **no
policies**, so no authenticated client can read or write it; only server code,
via the service-role client, behind an editor check. It is never sent to a
browser: the UI is told `hasDbPassword` and nothing more, and a blank field on
save means "keep the stored one", since the form was never given it to resend.
The Azure key is the destination's, held the same way.

## Layers

| Layer      | Files                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| Routing    | `app/(protected)/(app)/backups/page.tsx` (the index), `backups/[id]/page.tsx` (one target); `app/api/backups/**/route.ts` |
| UI         | `components/backups/backups-index.tsx`, `backup-target-detail.tsx`, `backup-stat-cards.tsx`, `backup-database-picker.tsx`, `backup-log-panel.tsx`, `backup-history.tsx`, `backup-schedule-test.tsx`, `backup-target-dialog.tsx`, `backup-storage-dialog.tsx` |
| Hook       | `hooks/backups/useBackups.ts`, `useBackupStorage.ts`                                      |
| Service    | `services/backups/backupService.ts` (rules + mapping), `backupStorageService.ts` (the destinations), `backupCronService.ts` (**testing the schedule**), `backupRunner.ts` (**the work**) |
| Repository | `backupTargets/*`, `backupStorage/*`, `backupRuns/*`, `backupCron/*` (Supabase), `mysql/mysqlDumpRepository.ts` (**processes**), `azure/azureBlobRepository.ts` (**Azure SDK**) |

Presentation helpers (`formatBytes`, `formatDuration`, `describeCron`,
`recordTone`, `computeBackupStats`, `groupRecordsByDay`) live in
`lib/backup-utils.ts`; domain types and the schedule presets in
`types/common/backup.ts`.

Two of those repositories are documented exceptions to "repositories only touch
Supabase" — `mysqlDumpRepository` spawns `mysqldump`/`mysql`, and
`azureBlobRepository` holds the Blob SDK. They join `jenkinsRepository` (HTTP).
Each builds requests and reports results; the rules are the service's.

## The runner

`services/backups/backupRunner.ts`, one database at a time:

1. `mysqldump --single-transaction --routines --triggers --events <db>` — a
   consistent InnoDB snapshot including routines, triggers and events, because a
   schema without them is not a restore. These are the flags the old worker
   proved against this same Azure MySQL server, and Alpine's client is MariaDB's
   build, which rejects Oracle-only options like `--column-statistics`.
2. `zlib.createGzip()`.
3. `BlockBlobClient.uploadStream` into
   `<container>/<target prefix>/<database>/<database>_<timestamp>.sql.gz`.

Details that matter:

- **The password goes in `MYSQL_PWD`, never argv** — anything on a command line
  is visible to every process in the container and lands in error messages.
  Every message leaving that repository is scrubbed of `-p…` and `password=…`
  regardless.
- **Both halves must succeed.** A `mysqldump` that dies mid-stream still produces
  a *valid gzip of a truncated dump*, which would upload happily and restore to
  nothing — so the upload's result and the dump's exit code are both awaited, and
  either failing fails that database.
- **The byte count comes from a counter in the pipe**, because the upload returns
  no size and asking Azure afterwards is a round trip for a number we already
  streamed past.
- **Sequential, not parallel.** `--single-transaction` is cheap on the server but
  the uploads are not, and eighteen concurrent streams would compete for the same
  bandwidth while multiplying the memory held in flight.
- **A run is not awaited by the request that starts it.** Eighteen databases is
  tens of minutes; `startBackup` records the batch, starts the work and returns.
  Progress goes to `backup_run_events`, so a reload — or someone else's browser —
  sees the same run.
- **One run per target.** A second is refused while a `backup_runs` row is still
  `running`, and a row older than three hours is treated as a dead container
  rather than a live run, or a target could never be backed up again.
- **Retention runs after the batch** and never fails it: the backups are made, and
  an old blob surviving a day longer is not a reason to report a good run as
  broken.

### If a dump ever needs to run elsewhere

Nothing in this design requires it to run in the web container. The runner is
plain server code behind `POST /api/backups/:id/run`, so a separate worker is a
second compose service running the same image with a different command, or a
second instance of the app whose cron URL points at itself. Reasons it might be
worth doing: keeping a long dump off the process that serves the UI, or reaching
a database only another host can see. Until one of those bites, one container is
one fewer thing to deploy.

## Scheduling

### Four schedules, chosen not typed

`BACKUP_CRON_PRESETS` in [types/common/backup.ts](../types/common/backup.ts) is
the whole vocabulary, and the form is a `Select`:

| Preset | Expression | For |
| --- | --- | --- |
| Every 5 minutes | `*/5 * * * *` | **testing only** |
| Daily at 02:00 | `0 2 * * *` | the default |
| Daily at 03:00 | `0 3 * * *` | staggering a second target |
| Daily at 05:00 | `0 5 * * *` | staggering a third |

Five-field cron is easy to get subtly wrong — `*/5 * * * *` and `* */5 * * *`
differ by a factor of twelve — and a wrong one is discovered a day later by a
backup that never happened. The column still holds a plain expression and pg_cron
still evaluates it, so a target carrying something else from before the presets
keeps it: the form offers it as *custom* rather than dropping it, because opening
the dialog to fix a typo in the notes must not silently reschedule the backups.

`describeCron` renders these in words (*Daily at 02:00*), which is what the
header and the schedule panel show. **Every 5 minutes is for proving the plumbing
works** and carries a `Testing only` pill wherever it is on — left running it
dumps every database twelve times an hour.

### The mechanism

`cron_schedule` **is** the schedule. `public.sync_backup_target_schedule()` keeps
one pg_cron job per target in step with the row, called by a trigger on insert,
on update of the schedule columns, and on delete — so no code path can change a
schedule without the schedule changing.

The job posts to `/api/backups/cron` with a bearer token. Both the URL and the
token are read **from Vault inside the job command**, so rotating either is one
statement and neither is copied into `cron.job`.

### Setup, once per project

```bash
supabase db push
```

```sql
select vault.create_secret('https://<this app>/api/backups/cron', 'backup_cron_url');
select vault.create_secret('<BACKUP_CRON_SECRET>', 'backup_cron_secret');
select public.sync_backup_target_schedule(id) from public.backup_targets;
```

`BACKUP_CRON_SECRET` must also be in the app's environment (see
[deployment.md](./deployment.md)) — the two values are compared, in constant
time, and an unset secret means scheduled backups are **refused** rather than
open to anyone who finds the URL.

**Supabase must be able to reach the app.** pg_cron makes an outbound HTTP call
from the database to wherever the portal is hosted; on a private network it never
arrives, and the symptom is a target whose page says *Scheduled, but never
dispatched yet*. `backup_dispatches` is the record of the asking — the thing the
worker's own history could never tell us.

**No cron job exists until a target's schedule is turned on.** A target showing
`Schedule off` has none by design; that is what the toggle means.

### Test schedule

Every link in that chain is somewhere this app cannot see, and when a schedule
silently does nothing there are four candidates with one identical symptom:

1. the job was never created (migrations not pushed, or the schedule is off)
2. a Vault secret is missing, so the job posts to a null URL
3. Supabase cannot reach the app (private network, or a stale URL)
4. the token does not match `BACKUP_CRON_SECRET`, so the app answers 401

**Test schedule** on a target page (admin) distinguishes them. It reads
`cron.job` and the last `cron.job_run_details` row, checks both Vault secrets,
and then has Postgres send **one real request down the same path a firing job
takes** — same URL, same token, same `net.http_post`. The body is
`{"test": true}`, which `/api/backups/cron` authenticates and answers *without
starting a dump*, so proving the schedule works costs nothing.

Each check names one link, so the answer is "the token doesn't match", not "it
isn't working". `pass` / `warn` / `fail`: a schedule deliberately left off is a
warning, a job registered for a schedule that is off is a failure (it will keep
firing).

Three `security definer` functions make this possible, because `cron.job`,
`vault.decrypted_secrets` and `net._http_response` are unreachable by the app's
roles:

| Function | Returns |
| --- | --- |
| `backup_cron_diagnostics(uuid)` | the job, its schedule, whether it is active, both secrets' presence, the cron URL (never the token), and the last firing |
| `backup_cron_ping()` | posts the handshake, returns pg_net's request id |
| `backup_cron_ping_result(bigint)` | that response — status, body, error — or `settled: false` while in flight |

Execute is granted to **`service_role` only**, the same bar as the secrets
tables, so a signed-in user cannot call them directly; the admin check is in
`backupCronService`. pg_net answers asynchronously, so the service polls for the
response for up to 15s and reports *no answer* as the finding it is.

## Two levels, like Projects

`/backups` is a **grid of target cards**; `/backups/[id]` is where the work
happens. A card answers "is this database being backed up, and is anything
wrong": whether the server can be reached, the destination container, the
schedule, the counts as chips (the same treatment the project card gives
*3 environments*), the last backup, and a warning when a reachable target has no
Azure destination — the one misconfiguration that stays silent until a run has
nowhere to put a dump.

The target page has **two views**, switched with the same `ToggleGroup` the
project page uses:

**Overview**

1. Four stat cards: backups recorded, last backup, databases (carrying the
   reachability and its reason, since the count comes *from* the connection), and
   the destination container.
2. **Select databases** — every database as a chip
   (`ToggleGroup type="multiple"`), with **Select all** / **Clear**. Nothing
   ticked means all, which is what a scheduled run always asks for, so the button
   says which of the two it is about to do. The selection clears after a
   successful run.
3. **Backup logs** — the `backup_run_events` of the most recent batch, polled at
   3s while a run is in flight. They are rows, not a stream, so they survive a
   reload and are still there afterwards.
4. **Configuration** — the read-back: connection, "dumped by: this app → Azure",
   the container, retention, which credentials are stored, and the last dispatch.

**History** — every run, **grouped by day and collapsed**: 200 records over
eighteen databases a night is a fortnight of near-identical rows, and a day
collapses to one line (*Wed 13 May · 18 dumps · 214 MB · All uploaded*), which is
the check you actually make. Every day starts open, with `Collapse all` /
`Expand all`; the state tracks which days are *closed*, so a day from a later
fetch arrives open and no state is seeded from data that hasn't loaded. The day
line is a grid with `tabular-nums`, so the values line up down the stack.

There are **two** outcomes per dump now, not three: a run that succeeded is in
Azure by definition, because the upload *is* the dump. "Succeeded locally but
never uploaded" was a state the worker's write-then-upload created.

### History is the container, not just our rows

**The blobs in Azure are the backups.** `backup_runs` is the record *about* a
run — who asked, how long it took, why it failed — and it exists only for runs
this app performed. Every dump taken before that, by the worker this feature
replaced, is still in the container with no row to its name.

So the history is the **union** of the two, assembled in `backupService`:

- each `backup_runs` row, with everything it knows;
- plus every blob no row accounts for (matched on `blob_name`), read back from
  its own metadata: path, size, `createdOn`. Duration shows as `—` rather than
  as zero, and the trigger reads `auto`, which is what a nightly schedule was.

Blobs are attributed to a target by path. This app writes
`<blob_prefix>/<database>/<file>`, which identifies the target exactly. The
older flat `<database>/<file>` layout has nothing to attribute by, so it is
claimed only when exactly **one** target still carries that container in its
legacy `azure_container` — with two candidates, showing those dumps under
neither beats showing them under the wrong database server.

Record ids therefore come in two shapes: a UUID for a run row, and
`blob_<base64url path>` for a blob. They are interpolated into a route path, and
a raw blob path would split across segments, so the encoded form keeps the id to
one opaque segment. `resolveRecordBlob` re-checks ownership on the way back in —
the id comes from the client, and a crafted one would otherwise reach any blob
in a shared container, including dumps an admin may delete.

If Azure cannot be reached the history falls back to the run rows alone, which
is a smaller list, not an error page.

## Permissions

| Action | Minimum role |
| --- | --- |
| See the targets, status, databases, history and logs | `viewer` |
| **Download** a dump — the database contents, not metadata about it | `editor` |
| Register or edit a target (host, user, credentials, Azure, retention), **run a backup** | `editor` |
| Change the **schedule**, **test** it, delete a dump, remove a target | `admin` |

A run is additive — it only ever creates a dump — so it sits at editor, and the
dispatch row records who asked. The admin set is what loses something or changes
*when* backups happen.

The schedule travels in the same payload as the rest of the configuration, so
`updateBackupTarget` raises the bar to admin **when a schedule field is
present**, rather than trusting a separate route nobody would notice was
unguarded.

Deleting a dump from the history deletes the blob. For a run this app performed
the row survives (that a backup was taken, and then deleted, is worth keeping);
a dump known only from the container leaves the history with the blob, because
there was never a row. The dialog says which of the two it is about to do.

Removing a target deletes its credentials, its history rows and its cron job —
**not the dumps in Azure.** Those are the backups; losing the record of them must
not lose them.

## API

| Method + path | Action | Role |
| --- | --- | --- |
| `GET  /api/backups` | every target with status, databases, history (rows + blobs) | `viewer` |
| `POST /api/backups` | register a target | `editor` |
| `GET  /api/backups/:id` | one target's overview | `viewer` |
| `PATCH  /api/backups/:id` | edit config/credentials (`editor`); schedule fields need `admin` | `editor` |
| `DELETE /api/backups/:id` | remove the target + credentials + history + cron job | `admin` |
| `GET  /api/backups/:id/logs?since=N` | the current batch's progress lines after N | `viewer` |
| `POST /api/backups/:id/run` | start a run (answers as soon as it has begun) | `editor` |
| `GET  /api/backups/:id/records/:recordId/download` | stream that dump out of Azure | `editor` |
| `DELETE /api/backups/:id/records/:recordId` | delete that dump from Azure | `admin` |
| `POST /api/backups/cron` | the scheduled entry point | **shared token** |
| `GET  /api/backups/storage` | the Azure destinations (secret-free) | `viewer` |
| `POST /api/backups/storage` | add a destination | `editor` |
| `PATCH  /api/backups/storage/:id` | edit one (blank connection string keeps it) | `editor` |
| `POST /api/backups/storage/:id` | test it — lists the container | `editor` |
| `DELETE /api/backups/storage/:id` | remove it; targets keep their history, blobs untouched | `admin` |
| `POST /api/backups/:id/schedule/test` | check the cron job, the secrets and the path from Supabase | `admin` |

## Security

- **Credentials**: `backup_target_secrets` (database passwords) and
  `backup_storage_secrets` (Azure connection strings), both RLS on with no
  policies — service-role only, never sent to a browser. Same construction as
  `vm_jenkins_secrets` and `environment_secrets`.
- **Outbound**: the app connects to a MySQL host and an Azure storage account an
  editor typed in. Unlike the Jenkins integration there is no URL being *fetched*,
  so the SSRF guard does not apply; what an editor can do is dump a database they
  can already reach into a container they control. See
  [security.md](./security.md#ssrf).
- **`POST /api/backups/cron`** is the app's only token-authenticated route. The
  comparison is constant-time, an unset `BACKUP_CRON_SECRET` refuses every call,
  and the token grants exactly one capability: start a backup.
- **Downloading** a dump is `editor`, one step above the rest of reading — a
  deliberate exception to "everyone reads everything"
  ([A5](./security.md#accepted-risks)), because a dump is every row of every
  table. It streams through this route, so the Azure connection string never
  leaves the server and no shareable blob URL exists.
- The accepted risk about the worker's unauthenticated API (A8) is **resolved by
  deletion**: there is no worker.
