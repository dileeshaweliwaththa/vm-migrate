# Database Backups

The **Backups** tab is where the team's database backups are configured,
scheduled, run and inspected — **MySQL/MariaDB and PostgreSQL/Supabase alike**.
All of it is this app:

```
pg_cron (per target, its own cron expression)
  └─ POST /api/backups/cron          shared-token auth; pg_cron has no session
       └─ backupRunner
            mysqldump | pg_dump (stdout) → gzip → Azure Blob uploadStream
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

One database **server** —
[`backup_targets`](./schema.md#backup_targets--backup_target_secrets--backup_dispatches).
Five things, and nothing else:

| | |
| --- | --- |
| Engine | `engine` — `mysql` or `postgres`, which decides the client and nothing else |
| Connection | `db_host`, `db_port`, `db_user` + the password in `backup_target_secrets` |
| Retention | `retention_days` — blobs older than this are deleted from its prefix after each run |
| Destination | `storage_id` → a shared `backup_storage_accounts` row |
| Schedule | `cron_schedule`, `schedule_enabled` → a pg_cron job |

`db_name` is deliberately absent: the runner asks the server what databases it
has and dumps each one, which is why "18 databases" is a property of the server
rather than 18 rows here. (Postgres cannot be connected to without naming a
database, so `psql` asks *from* `postgres`, the one every cluster has — a
connection detail, not a column.)

**The database password lives in `backup_target_secrets`** — RLS on with **no
policies**, so no authenticated client can read or write it; only server code,
via the service-role client, behind an admin check. It is never sent to a
browser: the UI is told `hasDbPassword` and nothing more, and a blank field on
save means "keep the stored one", since the form was never given it to resend.
The Azure key is the destination's, held the same way.

## Layers

| Layer      | Files                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| Routing    | `app/(protected)/(app)/backups/page.tsx` (the index), `backups/[id]/page.tsx` (one target); `app/api/backups/**/route.ts`, of which `[id]/live/route.ts` is the one that talks to anything outside Supabase |
| UI         | `components/backups/backups-index.tsx`, `backup-target-detail.tsx`, `backup-stat-cards.tsx`, `backup-database-picker.tsx`, `backup-log-panel.tsx`, `backup-history.tsx`, `backup-schedule-test.tsx`, `backup-target-dialog.tsx`, `backup-storage-dialog.tsx` |
| Hook       | `hooks/backups/useBackups.ts`, `useBackupStorage.ts`                                      |
| Service    | `services/backups/backupService.ts` (rules + mapping), `backupStorageService.ts` (the destinations), `backupCronService.ts` (**testing the schedule**), `backupRunner.ts` (**the work**) |
| Repository | `backupTargets/*`, `backupStorage/*`, `backupRuns/*`, `backupCron/*` (Supabase), `mysql/mysqlDumpRepository.ts` + `postgres/pgDumpRepository.ts` (**processes**), `azure/azureBlobRepository.ts` (**Azure SDK**) |

Presentation helpers (`formatBytes`, `formatDuration`, `describeCron`,
`recordTone`, `computeBackupStats`, `groupRecordsByDay`, and `mergeRecords` /
`newerTimestamp`, which join the two payloads below) live in
`lib/backup-utils.ts`; domain types and the schedule presets in
`types/common/backup.ts`.

Three of those repositories are documented exceptions to "repositories only touch
Supabase" — `mysqlDumpRepository` spawns `mysqldump`/`mysql`, `pgDumpRepository`
spawns `pg_dump`/`pg_dumpall`/`psql`, and `azureBlobRepository` holds the Blob
SDK. They join `jenkinsRepository` (HTTP). Each builds requests and reports
results; the rules are the service's. The two dump repositories expose the **same
two functions** (`listDatabases`, `openDumpStream`), which is what lets the runner
treat them as interchangeable.

## How the pages load

**Two tiers, because two of these facts cost a thousand times what the others
do.** The name, the host, the schedule, the destination, how the runs have gone —
all of it is in Postgres. Whether the server *answers*, which databases are on it,
and what the container holds are a MySQL handshake to another host and a blob
listing.

They used to be one payload, so nothing rendered until both had returned: a
several-second blank page for a card whose text had been sitting in Postgres the
whole time. Worse, it scaled the wrong way — one MySQL connection and one full
container listing **per target**, on every visit, before anything appeared.

So the split is by *who can answer*:

| | Answered by | Route | Query key | Policy |
| --- | --- | --- | --- | --- |
| Configuration, schedule, run counts, last run, last dispatch | Supabase | `GET /api/backups`, `GET /api/backups/:id` | `backup-targets`, `backup-target` | refetched every 30s |
| Reachability, the database list, the dumps only the container knows about | MySQL + Azure | `GET /api/backups/:id/live` | `backup-live`, one per target | 5-minute `staleTime`, never polled, no refetch on focus, no retry |

The page draws from the first and fills in from the second. Until a live check
lands, a card says **Checking** rather than guessing — "no databases" and "we have
not asked yet" must not look the same on a page whose job is to say whether
backups are happening, and neither may look like **Check failed**, which is the
route erroring rather than the database refusing.

Three things make this cheap rather than merely deferred:

- **The counts are aggregated in Postgres**, by
  [`backup_run_stats`](./schema.md#backup_run_stats-view). The index was reading
  200 run rows per target to call `.length` on them.
- **The container is listed under the target's own prefix.** `listBlobs` takes a
  prefix and this app writes `<blob_prefix>/<database>/<file>`, so Azure returns
  exactly this target's blobs instead of every dump every target ever wrote. Only
  a target claiming the old flat `<database>/<file>` layout still lists the whole
  container, because that layout has no prefix to narrow by.
- **The index and the target page share the `backup-live` key**, so opening a
  card costs nothing — the check its tile already made is the check the page
  wants.

The live key is only invalidated when something actually changed out there:
editing a target (the host and credentials decide reachability), deleting a dump,
and a run **finishing** — which the target page watches for, because a run
*starting* returns minutes before any blob exists and the log panel is what
follows it in between.

## Two engines, one pipe

A target says whether it is MySQL or Postgres and the runner picks the matching
pair of functions out of `ENGINE_CLIENTS`. **Everything after that is identical**
— the gzip, the upload, the byte counter, the run rows, the blob layout,
retention, the schedule, the history — because the only thing that actually
differs between backing up an Azure MySQL server and backing up the self-hosted
Supabase Postgres is which binary produces the SQL.

| | `mysql` | `postgres` |
| --- | --- | --- |
| List the databases | `mysql -N -B -e 'SHOW DATABASES'` | `psql -A -t -q -c 'select datname from pg_database …'` |
| Dump one | `mysqldump --single-transaction --routines --triggers --events` | `pg_dump` |
| Credential | `MYSQL_PWD` | `PGPASSWORD` |
| Connect timeout | `--connect-timeout=10` on `mysql`, a no-first-byte kill on `mysqldump` | `PGCONNECT_TIMEOUT=10`, both binaries |
| Default port | 3306 | 5432 |
| Repository | `repositories/mysql/mysqlDumpRepository.ts` | `repositories/postgres/pgDumpRepository.ts` |
| Alpine package | `mysql-client` | `postgresql17-client` |

A lookup rather than an `if` at each call site: a third engine is a third entry
there and a value in the `backup_engine` enum, not a search for every place the
runner asked which one it was. That is not a hypothetical tidiness argument —
`startBackup` was missed when the dispatch went in and kept calling the MySQL
client directly, so "back up all databases" on a Postgres target ran `mysql`
against Postgres.

**Both engines cap the connection phase**, which is what made that bug
disappointing rather than catastrophic. Pointed at a listening port that is not
its own protocol, the MySQL client does not fail — it *hangs*: MySQL's handshake
has the server send the first packet while Postgres waits for the client, so both
block. Measured against the live Postgres port: with no timeout it was still
waiting when killed at 25s; with `--connect-timeout=10` it exits after 10s with
*"Lost connection to MySQL server at 'waiting for initial communication
packet'"*. A hung dump call hangs the HTTP request behind it, which reaches the
browser as a bodiless gateway error with no message to show.

**But that flag belongs to the `mysql` client alone.** `--connect-timeout` is
not a `mysqldump` option, and MariaDB's `mariadb-dump` — which is what
`mysqldump` resolves to in this image — rejects it before connecting to
anything:

```
mysqldump: unknown variable 'connect-timeout=10'
```

Putting it in the arguments *both* binaries share therefore cost this
deployment a night of MySQL backups: 0/19 databases on 18 Sept 2026, each run
dead in about 200ms. The shape of that failure is the lesson. Listing the
databases still worked, because the client it uses does take the flag — so the
target read **Ready**, the live check showed all 19 databases, the schedule
fired on time and the batch enumerated every one of them, and only the dumps
failed. *Anything shared between the listing path and the dump path has to be
valid for both binaries, and the listing path succeeding says nothing about the
dump path.*

The dump keeps the same bound by other means: if `mysqldump` has produced **no
output at all** after ten seconds it is killed, since a dump that has not begun
by then is waiting on a handshake that is not coming. Those bytes are watched
through a `Transform` in the pipe rather than by a `data` listener on the
child's stdout, which would put that stream into flowing mode before the runner
attaches its own pipe and silently drop the opening chunks of the dump.

### What each dump contains, and why

**MySQL** keeps the flags the old worker proved against this same Azure server:
`--single-transaction` for a consistent InnoDB snapshot without locking, and
`--routines --triggers --events` because a schema without them is not a restore.
Alpine's client is MariaDB's build, which rejects Oracle-only options like
`--column-statistics`.

**Postgres takes no snapshot flag**, because it does not need one: `pg_dump`
already reads the whole dump from a single repeatable-read snapshot.
(`--serializable-deferrable` is stronger still, but it *waits* for a snapshot
with no anomalies and can sit there indefinitely on a busy server — a hung
nightly backup rather than a better one.)

**Owners and grants are kept**, which is the one place the obvious recipe is
wrong. The "move your database to Supabase" guides use `--no-owner --no-acl`
because they are restoring into a cluster whose roles differ. This is a backup of
*that* cluster, and a self-hosted Supabase is held together by its grants: `anon`,
`authenticated` and `service_role` are what PostgREST connects as, and every RLS
policy is written against them. A dump stripped of that restores every table and
then serves 401s.

**`_globals` is dumped alongside the databases.** Roles and grants are
cluster-wide, so they belong to no single database — `pg_dumpall --globals-only`
captures them, and `listDatabases` returns `_globals` first because that is the
order a restore needs: the roles have to exist before a dump that grants to them
can be replayed. It appears in the picker and the history like any other entry;
the underscore says it is not a database name.

Both engines produce **plain SQL gzipped to `.sql.gz`**, not `-Fc`. One restore
story (`gunzip -c … | psql` / `| mysql`), one blob layout, and a file you can read
without the tool that wrote it.

### The Supabase target specifically

It is an ordinary Postgres target with **one trap**, found by pointing this code
at the real server rather than by reasoning about it:

| | |
| --- | --- |
| Engine | PostgreSQL / Supabase |
| Host / Port | the database's address and **its own port** — this deployment publishes **5433**, not 5432 |
| User | **`supabase_admin`**, not `postgres` — see below |
| Password | the database password, stored write-only like every other |

**`postgres` is not enough, and fails late.** On a self-hosted Supabase the
`postgres` role is *not* a superuser (`rolsuper = false`; it has `bypassrls`, which
is a different thing), while `auth`, `storage`, `_analytics` and `_realtime` are
owned by `supabase_admin`. `pg_dump` takes an ACCESS SHARE lock on every table it
is about to dump, so one unreadable table fails the **whole** dump:

```
pg_dump: error: query failed: ERROR:  permission denied for table schema_migrations
pg_dump: detail: Query was: LOCK TABLE auth.users, auth.refresh_tokens, … IN ACCESS SHARE MODE
```

The trap is that **listing the databases succeeds as `postgres`**, so the target's
live check says *Ready* and only the 02:00 run fails. Hence two mitigations: the
form says so under the engine picker, and `pgDumpRepository.explainFailure`
appends the reason to any "permission denied" a run reports, because the raw
message is a hundred-table `LOCK` statement that never names the role.

Supabase's own [Postgres 17 upgrade
guide](https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17) takes
its logical backup with `-U supabase_admin` for the same reason. (That page has
nothing to say about client versions, flags or which databases to dump — the
rest of this section is from PostgreSQL's own behaviour, checked against the
server.)

**Verified against the live server** (self-hosted Supabase, PostgreSQL 15.1):

| Check | Result |
| --- | --- |
| `psql … -c 'select datname from pg_database …'` | exit 0 — one database, `postgres` |
| `pg_dump --schema-only` as `postgres` | **exit 1**, permission denied |
| `pg_dump --schema-only` as `supabase_admin` | exit 0, 328 KB |
| `pg_dumpall --globals-only` as `postgres` | exit 0, 6.2 KB, 18 roles |
| `pg_dump \| gzip` as `supabase_admin`, the runner's own pipe | exit 0, **158 MB gzipped in 32m 33s** |

Three consequences for this deployment:

- Everything lives in the single `postgres` database, so the target dumps
  **two** entries: `_globals` and `postgres`. The card reads *1 database*,
  because `_globals` is not one.
- **A run takes half an hour and produces 158MB.** That is the case the runner
  was already built for — `startBackup` returns as soon as the work begins and
  the log panel follows it, so no request is waiting on the response — and it is
  comfortably inside the three-hour `STALE_RUN_MS` window that decides whether a
  `running` row is a live run or a dead container. Worth re-checking that margin
  if a target ever grows to many large databases, since they are dumped
  **sequentially**.
- At the default seven-day retention that is roughly **1.1GB** in the container
  for this target alone.

`pg_dump` emits one warning on this database, and it is benign here:

```
pg_dump: warning: there are circular foreign-key constraints on this table: key
pg_dump: hint: Consider using a full dump instead of a --data-only dump to avoid this problem.
```

It warns that a *data-only* restore could fail on the cycle. These are full
dumps, which is what the hint itself recommends — and the exit code is 0, which
is what the runner judges on. Both clients write notices to stderr on a good run,
so stderr is only ever the explanation of a non-zero exit, never the verdict.

**TLS is off on this server.** `PGSSLMODE` defaults to `prefer`, which negotiates
TLS and falls back, so the connection here is plaintext — verified with
`pg_stat_ssl`, which reports `ssl=off`. The password and the whole dump therefore
cross the network in the clear, and the host is a public address. Fixing that is
a change on the server (enable TLS), not here.

Note the limitation if you do: `PGSSLMODE` is read from the **app's process
environment**, so it applies to every Postgres target at once. Setting it to
`require` would insist for all of them, and break any that cannot. Per-target TLS
would need its own column. `PGCONNECT_TIMEOUT` (default 10s) is process-wide for
the same reason; it keeps an unreachable host from hanging the page's live
check.

### What a Supabase dump contains, and what it cannot

**This feature takes a logical backup over a database connection.** That is a
real constraint, not a detail: everything it can reach is reachable through
libpq, and everything else on that host is not. Supabase's own
[upgrade guide](https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17)
lists three backups for that reason — the data directory, the pgsodium key, and
the logical dump — and **only the third is this**.

What the dump does carry, counted from the live server:

| | |
| --- | --- |
| Schemas | 12 — `public`, `auth`, `storage`, `realtime`, `_realtime`, `_analytics`, `supabase_functions`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`, `pgsodium`, `vault` |
| Tables | 25 `public`, 16 `auth`, 5 `storage` |
| Rows that matter | 302 `auth.users`, 3 `storage.buckets`, 245 `storage.objects` |
| Extensions | 9, emitted as `CREATE EXTENSION` |
| Access control | 21 RLS policies, 496 `GRANT`s, 224 `OWNER TO` |
| Cluster-wide | 18 roles with their password hashes, in `_globals` |

Those 496 grants and 224 ownership statements are the concrete reason this does
**not** pass `--no-owner --no-acl`: every one of them would be discarded.

**Four things it cannot capture**, each because they are not in the database:

| Gap | Where it actually lives | Does it bite today? |
| --- | --- | --- |
| The **245 storage files** | the storage container's filesystem or S3 — `storage.objects` is only metadata | **Yes.** The rows restore; the files are gone. |
| The **pgsodium root key** | `/etc/postgresql-custom/pgsodium_root.key`, in the `db-config` Docker *named volume* | **Not yet** — `pgsodium` 3.1.8 and `supabase_vault` 0.2.8 are installed but `vault.secrets` and `pgsodium.key` are both empty. The day something is put in Vault, this backup silently stops being complete. |
| Edge Functions, Auth settings, API keys, Realtime config | Supabase's own config, not Postgres | Yes, if any are customised. |
| The physical data directory | `./volumes/db/data` | It is a different kind of backup — a binary copy for `pg_upgrade` and point-in-time recovery, which a logical dump is not a substitute for. |

The first two are covered by two commands on the Supabase host, which belong in
that host's own routine rather than in this app:

```bash
# the pgsodium root key — lose it with secrets in Vault and they are unrecoverable
docker compose run --rm db cat /etc/postgresql-custom/pgsodium_root.key > ./pgsodium_root.key.backup

# the data directory, for pg_upgrade / PITR
cp -a ./volumes/db/data ./volumes/db/data-manual-backup
```

Restoring into a **new** Supabase project has further gaps that are Supabase's,
not ours — extensions must be re-enabled first, and `auth`/`storage` already
exist there so their `CREATE`s error harmlessly. See
[Restore a dashboard backup](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore).

### Why not `pg_dumpall`, and why not `--create`

Supabase's guide suggests `pg_dumpall -U supabase_admin` as its optional logical
backup. **This feature's output is equivalent in content** — `pg_dumpall` is
globals plus a `pg_dump` of each database, which is exactly `_globals` plus the
per-database dumps — but it is split into one blob per database instead of one
file per cluster. That is deliberate: a per-database blob can be restored,
retained, downloaded and deleted on its own, and the history reads as a row per
database rather than a single opaque object.

`pg_dump --create` was considered and rejected. It would make each blob
self-contained by emitting `CREATE DATABASE`, which sounds strictly better — but
Supabase's own restore path connects to the existing `postgres` database
(`psql -d <connection string> -f dump.sql`), where a `CREATE DATABASE postgres`
would simply fail. Confirmed against the server: the dump as produced contains
**zero** `CREATE DATABASE` statements, which is what that restore path wants.

## The runner

`services/backups/backupRunner.ts`, one database at a time:

1. The engine's dump command (above), streaming to stdout.
2. `zlib.createGzip()`.
3. `BlockBlobClient.uploadStream` into
   `<container>/<target prefix>/<database>/<database>_<timestamp>.sql.gz`.

Details that matter:

- **The password goes in `MYSQL_PWD` / `PGPASSWORD`, never argv** — anything on a
  command line is visible to every process in the container and lands in error
  messages. Every message leaving those repositories is scrubbed of `-p…`,
  `password=…` and `postgres://user:pass@` regardless.
- **Both halves must succeed.** A dump that dies mid-stream still produces
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

The job calls `public.run_backup_cron_job(<target>)`, which posts to
`/api/backups/cron` with a bearer token. Both the URL and the token are read
**from Vault at firing time**, so rotating either is one statement and neither is
copied into `cron.job`.

That function exists so a missing secret reports itself. The command used to
inline `net.http_post(url := (select … from vault …))`, and an absent secret made
that `NULL`, so pg_cron recorded *null value in column "url" of relation
"http_request_queue" violates not-null constraint* — pg_net's internals, every
five minutes, describing anything but the actual cause. It now raises
*"backup_cron_url is not set in Supabase Vault"*.

### A scheduled run has no session, so it reads service-role

pg_cron sends a **bearer token and no cookie**. The request-scoped Supabase
client built from that request is therefore `anon`, and every select policy on
this feature is `to authenticated` — so under RLS the target row, its
destination and its running-run count are all simply *not there* for the one
caller that fires unattended.

That is not a permissions question the policies should answer: the scheduled
path has already been authenticated, by the shared token, before any of it runs.
So the runner's reads go through the **service-role** client, the same way its
writes (`insertBackupRun`, `insertBackupRunEvent`, `insertBackupDispatch`)
always have — `findBackupTargetByIdAsService`,
`findStorageAccountByIdAsService`, `countRunningBackupsAsService`, and
`listScheduledBackupTargetIds` for a catch-all job. The gate is the caller's:
`requireAdmin` on the manual path, the token on the scheduled one.

Read with the request client instead and the schedule fires perfectly, arrives
perfectly, and fails every night with **"Backup target not found."** for a
target the page is displaying at the time — which is what `backup_dispatches`
is for. A failed dispatch is the app's own answer, so its reason is on the
Configuration card under *Last dispatch* (hover it for the message); the four
candidates below are all the links *before* that row could be written.

### Setup, once per project

```bash
supabase db push
```

```sql
select vault.create_secret('https://<this app>/api/backups/cron', 'backup_cron_url');
select vault.create_secret('<BACKUP_CRON_SECRET>', 'backup_cron_secret');
select public.sync_backup_target_schedule(id) from public.backup_targets;
```

`backup_cron_url` is this app's own address **as Supabase can reach it** — the
deployed portal on port 5174, not `localhost`, which from inside Supabase's
network means one of their servers. `backup_cron_secret` is a random token you
invent; its only job is to be identical to `BACKUP_CRON_SECRET` in the app's
environment, since pg_cron has no session to authenticate with.

`BACKUP_CRON_SECRET` must also be in the app's environment (see
[deployment.md](./deployment.md)) — the two values are compared, in constant
time, and an unset secret means scheduled backups are **refused** rather than
open to anyone who finds the URL.

**Supabase must be able to reach the app.** pg_cron makes an outbound HTTP call
from the database to wherever the portal is hosted; on a private network it never
arrives, and the symptom is a target whose page says *Scheduled, but never
dispatched yet*. `backup_dispatches` is the record of the asking — the thing the
worker's own history could never tell us.

A dispatch row written and marked `failed` means the opposite of the four below:
the whole chain worked and **the app** refused the run. Its `error` is the
reason, verbatim.

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

The two halves arrive separately — the rows with the page, the blobs with the
live check — and `mergeRecords` joins them in the browser, so the history this app
recorded is on screen while the container is still being listed.

If Azure cannot be reached the history falls back to the run rows alone, which
is a smaller list, not an error page.

## Permissions

**Admin-write, everyone-read.** One gate for the whole tab, unlike the rest of
this app:

| Action | Minimum role |
| --- | --- |
| See the targets, their status, **the databases**, the history and the logs | `viewer` |
| Everything else — register or edit a target, run a backup, download or delete a dump, add or edit a destination, change the schedule and test it, remove a target | `admin` |

The usual editor/viewer split is right for a tracker row. It is wrong here,
because nothing on this tab is merely editing a record: a target holds a
credential that can read every database on a server, a dump *is* those databases
(every row of every table, in one file), and the schedule decides whether any of
it happens. "Edit the target but don't run it" is not a distinction worth
modelling when both hands are on the same lever.

**Reading stays open to every signed-in role, deliberately.** That last night's
backup ran is not a privilege, and hiding it from the people who would notice it
had stopped is the wrong way round. A viewer gets the whole page — the stat
cards, the database list, the log, the schedule, the history — with no controls
on it. The database list in particular is rendered for them as labels rather than
withheld: *which* databases are on the server is what "this is backed up"
actually means.

Enforced in `backupService` and `backupStorageService` (`requireAdmin`
throughout), with RLS as the floor under it — `backup_targets` and
`backup_storage_accounts` gate writes on `current_user_role() = 'admin'`, so a
route added without a check still cannot write. `backup_dispatches` has **no**
insert policy: a scheduled run has no session to satisfy one with, so those rows
are written service-role, and `runBackup` is the only way in.

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
| `GET  /api/backups` | every target's configuration, schedule, run counts and last dispatch — Supabase only | `viewer` |
| `POST /api/backups` | register a target | `admin` |
| `GET  /api/backups/:id` | the same for one target, plus the runs this app performed | `viewer` |
| `GET  /api/backups/:id/live` | is the server reachable, which databases are on it, and which dumps in the container have no run row — **the slow one** | `viewer` |
| `PATCH  /api/backups/:id` | edit config, credentials and schedule | `admin` |
| `DELETE /api/backups/:id` | remove the target + credentials + history + cron job | `admin` |
| `GET  /api/backups/:id/logs?since=N` | the current batch's progress lines after N | `viewer` |
| `POST /api/backups/:id/run` | start a run (answers as soon as it has begun) | `admin` |
| `GET  /api/backups/:id/records/:recordId/download` | stream that dump out of Azure | `admin` |
| `DELETE /api/backups/:id/records/:recordId` | delete that dump from Azure | `admin` |
| `POST /api/backups/cron` | the scheduled entry point | **shared token** |
| `GET  /api/backups/storage` | the Azure destinations (secret-free) | `viewer` |
| `POST /api/backups/storage` | add a destination | `admin` |
| `PATCH  /api/backups/storage/:id` | edit one (blank connection string keeps it) | `admin` |
| `POST /api/backups/storage/:id` | test it — lists the container | `admin` |
| `DELETE /api/backups/storage/:id` | remove it; targets keep their history, blobs untouched | `admin` |
| `POST /api/backups/:id/schedule/test` | check the cron job, the secrets and the path from Supabase | `admin` |

## Security

- **Credentials**: `backup_target_secrets` (database passwords) and
  `backup_storage_secrets` (Azure connection strings), both RLS on with no
  policies — service-role only, never sent to a browser. Same construction as
  `vm_jenkins_secrets` and `environment_secrets`.
- **Outbound**: the app connects to a MySQL host and an Azure storage account an
  admin typed in. Unlike the Jenkins integration there is no URL being *fetched*,
  so the SSRF guard does not apply; what an admin can do is dump a database they
  can already reach into a container they control. See
  [security.md](./security.md#ssrf).
- **`POST /api/backups/cron`** is the app's only token-authenticated route. The
  comparison is constant-time, an unset `BACKUP_CRON_SECRET` refuses every call,
  and the token grants exactly one capability: start a backup.
- **Downloading** a dump is `admin`, with the actions rather than with the
  reading — a deliberate exception to "everyone reads everything"
  ([A5](./security.md#accepted-risks)), because a dump is every row of every
  table. It streams through this route, so the Azure connection string never
  leaves the server and no shareable blob URL exists.
- The accepted risk about the worker's unauthenticated API (A8) is **resolved by
  deletion**: there is no worker.
