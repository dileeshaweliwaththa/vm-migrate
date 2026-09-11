# Data Model

Supabase tables are **never** created or altered by application code or by
migrations run from the app. Every schema change is a timestamp-prefixed `.sql`
migration in [`supabase/migrations/`](../supabase/migrations), managed with the
**Supabase CLI** and applied in timestamp order. The `supabase/` folder is not
imported by the app and is excluded from both the Next.js build
(`next.config.ts`) and the TypeScript project (`tsconfig.json`).

## `profiles`

One row per `auth.users` entry, created automatically by the
`on_auth_user_created` trigger on sign-up. Extend this table with the columns
your app needs.

| column       | type          | notes                                             |
| ------------ | ------------- | ------------------------------------------------- |
| `id`         | `uuid`        | primary key, FK → `auth.users.id`                 |
| `email`      | `text`        | from sign-up                                      |
| `name`       | `text`        | nullable; from sign-up metadata                   |
| `role`       | `text`        | RBAC role: `admin` \| `editor` \| `viewer` (default `viewer`) |
| `created_at` | `timestamptz` | default `now()`                                   |

RLS: authenticated users can read their own profile (`id = auth.uid()`);
**admins** (via `current_user_role() = 'admin'`) can additionally read and
update all profiles, which powers the admin user-management flow.

Fixed-value columns use Postgres **enum types** (not `text` + `CHECK`):
`user_role` (`profiles.role`), `cicd_provider` (`projects`/`environments`),
`net_protocol` (`endpoints.protocol`), `port_source`
(`endpoints.source`), `environment_name` (`environments.name` —
`DEV`/`STAGE`/`PRODUCTION`), and `jenkins_run_phase` / `jenkins_build_status`
(`environment_build_runs`). Each mirrors a TS constant of the same values
(`USER_ROLES`, `CICD_PROVIDERS`, `PROTOCOLS`, `PORT_SOURCES`,
`ENVIRONMENT_NAMES`, `JENKINS_RUN_PHASES`, `JENKINS_STATUSES`). The legacy
`vm_urls.proto` was the one exception, kept as `text` for tracker-data
compatibility; it became `endpoints.protocol` (`net_protocol`) when the two URL
tables were unified, its free-text values normalized in that migration.

`public.current_user_role()` is a `SECURITY DEFINER` helper that returns the
signed-in user's role; every Phase 2 table's RLS reuses it to gate writes
(select = any authenticated user, insert/update = editor|admin, delete =
admin). See [phase-2-plan.md](./phase-2-plan.md) §2–§3.

## `vms`

One row per virtual machine tracked through a migration. **Shared across all
authenticated users** — this is an internal team tool, so there is no per-user
ownership: every signed-in user sees the same rows.

RLS follows the same role split as the Phase 2 tables: read = any authenticated
user (**viewers included, read-only**), insert/update = `editor`/`admin`,
delete = `admin`. Delete is admin-only because the destructive tracker actions
(purge, clear-trash, replace-all import) all bottom out in a row delete. The
table originally shipped with full write access for any authenticated user;
`…_restrict_vm_tracker_writes.sql` brought it under RBAC.

| column             | type          | notes                                              |
| ------------------ | ------------- | -------------------------------------------------- |
| `id`               | `uuid`        | primary key, `gen_random_uuid()`                   |
| `name`             | `text`        | VM name                                            |
| `old_ip`           | `text`        | source IP                                          |
| `new_ip`           | `text`        | destination IP                                     |
| `migrated`         | `boolean`     | migration done?                                    |
| `is_supabase`      | `boolean`     | hosts Supabase — never decommission                |
| `keep`             | `boolean`     | "not migrating" / keep as-is                       |
| `is_client`        | `boolean`     | Client VM (vs. our UPVIEW servers)                 |
| `expanded`         | `boolean`     | UI expand state                                    |
| `notes`            | `text`        | free text                                          |
| `migrated_archive` | `jsonb`       | purged source VMs whose URLs were archived here    |
| `deleted`          | `boolean`     | soft-delete flag (in trash)                        |
| `deleted_at`       | `timestamptz` | when trashed                                       |
| `group_id`         | `uuid`        | FK -> `vm_groups.id`, `on delete set null`; null = ungrouped |
| `created_at`       | `timestamptz` | default `now()`                                    |
| `updated_at`       | `timestamptz` | kept fresh by the `set_updated_at` trigger         |

## `vm_urls` — removed

Folded into [`endpoints`](#endpoints) and dropped. See
`…_unify_urls_into_endpoints.sql`.

## `vm_groups`

A named group of VMs — one client's or provider's fleet (every `EUKHOST-*`
machine under one `EUKHOST` header). **One group, many VMs:** the FK lives on
`vms.group_id`, so a VM belongs to at most one group.

Deliberately *not* a many-to-many join table like `project_tags`. A machine sits
on exactly one account, and letting it be in two groups would make "how many VMs
does EUKHOST have" ambiguous and the tracker's grouped rendering impossible — a
row would have to appear under two headers.

The FK is `on delete set null`, so deleting a group **ungroups** its VMs and
never deletes them. That is also why delete sits at `editor`+ here rather than
`admin` (following `endpoints`, not `vms`): nothing but the grouping is lost.

RLS: read = any authenticated user; insert/update/delete = `editor`/`admin`.

| column       | type          | notes                                      |
| ------------ | ------------- | ------------------------------------------ |
| `id`         | `uuid`        | primary key                                |
| `name`       | `text`        | unique — e.g. `EUKHOST`                    |
| `notes`      | `text`        | free text (account references, contacts)   |
| `created_at` | `timestamptz` | default `now()`                            |
| `updated_at` | `timestamptz` | kept fresh by the `set_updated_at` trigger |

## `vm_jenkins` / `vm_jenkins_secrets`

**A VM runs one Jenkins, so the server belongs to the machine.** `vm_jenkins`
holds the server URL and the Basic-auth username (one row per VM, PK = `vm_id`,
cascade); `vm_jenkins_secrets` holds the API token. An environment on that VM
keeps only its **job** (`environments.jenkins_url`).

The URL is normalized on write and a missing port becomes **8080** — Jenkins'
default, and what these servers run on — so the form only needs the machine's
address (`normalizeJenkinsServerUrl` in [lib/jenkins-url.ts](../lib/jenkins-url.ts)).

`vm_jenkins` RLS: read = any authenticated user (which machines run Jenkins is
not a secret — the tracker marks them for everyone), insert/update/delete =
`editor`/`admin`.

`vm_jenkins_secrets` has **RLS on with no policies**, exactly like
`environment_secrets`: no authenticated client can read or write it, only server
code via the service-role client behind an editor check. That is what lets a
viewer trigger a build without ever being sent the token.

| table                | columns                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `vm_jenkins`         | `vm_id uuid pk → vms`, `base_url text`, `username text`, `created_at`, `updated_at` |
| `vm_jenkins_secrets` | `vm_id uuid pk → vms`, `jenkins_api_token text`, `created_at`, `updated_at` |

The per-environment columns (`environments.jenkins_username`,
`environment_secrets`) are **not** dropped: they remain a read-only fallback for
an environment with no VM to inherit from. See
[jenkins-sync.md](./jenkins-sync.md#where-jenkins-is-configured).

## `backup_targets` / `backup_target_secrets` / `backup_dispatches`

The **Backups** tab. A *target* is a MySQL server we back up: what to connect to,
where the dumps go, and when it runs.
The app owns all of it: the configuration, the credentials, the schedule **and**
the dump — `mysqldump` → gzip → Azure Blob, streamed, nothing on disk. (A
Supabase Edge Function could not, at 2s of CPU with no binaries; the app's own
runtime has no such limit. See [backups.md](./backups.md).)

There is no `vm_id`: a backup target is a *database server* (mencartdb is Azure
Database for MySQL), and tying it to a machine in the tracker said something
untrue about most of them. `db_name` is deliberately absent — a run enumerates
the server's databases and dumps each one, which is what makes "19 databases" a
property of the server rather than 19 rows.

`cron_schedule` is handed to **pg_cron** by
`public.sync_backup_target_schedule()`, which a trigger keeps in step with the
row — so this column *is* the schedule. Its values come from
`BACKUP_CRON_PRESETS` (every 5 minutes for testing, then 02:00/03:00/05:00
daily), though the column accepts any valid five-field expression and older rows
may hold one.

Three `security definer` functions let the app check that schedule without
waiting for it to fire — `backup_cron_diagnostics(uuid)`, `backup_cron_ping()`
and `backup_cron_ping_result(bigint)`. They read `cron.job`,
`vault.decrypted_secrets` and `net._http_response`, which no client role can
reach, so execute is granted to **`service_role` only**. See
[backups.md § Scheduling](./backups.md#scheduling).

RLS: `backup_targets` and `backup_dispatches` read = any authenticated user;
`backup_targets` writes = **`admin` only** (see
[backups.md § Permissions](./backups.md#permissions) for why this tab does not
use the usual editor split). `backup_dispatches` has **no insert policy** — a
scheduled run has no session to satisfy one with, so `runBackup` writes those
rows with the service-role client. `backup_target_secrets` has **RLS on with no
policies** — service-role only, like `vm_jenkins_secrets`.

| column            | type          | notes                                       |
| ----------------- | ------------- | ------------------------------------------- |
| `id`              | `uuid`        | primary key                                 |
| `name`            | `text`        | e.g. `mencartdb (Azure MySQL)`; defaults to the host |
| `worker_url`      | `text`        | **legacy** — the external worker this feature used before the app performed its own dumps. Nothing writes it |
| `db_host` / `db_port` / `db_user` | `text` / `integer` / `text` | what a run connects to |
| `azure_account` / `azure_container` | `text` | **legacy** — superseded by `storage_id`; still read to attribute pre-unification blobs |
| `storage_id`      | `uuid`        | → `backup_storage_accounts`, `on delete set null` |
| `blob_prefix`     | `text`        | this target's folder in the shared container; fixed at creation |
| `retention_days`  | `integer`     | how long dumps are kept                     |
| `cron_schedule`   | `text`        | five-field cron, run by pg_cron             |
| `schedule_enabled`| `boolean`     | whether the pg_cron job exists at all       |
| `notes` / `position` | `text` / `integer` | free text, display order            |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger        |

| table                   | columns                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `backup_target_secrets` | `target_id uuid pk → backup_targets`, `db_password text`, `azure_connection_string text` (legacy — the key lives on the destination), timestamps |
| `backup_dispatches`     | `id`, `target_id → backup_targets`, `source backup_dispatch_source`, `status backup_dispatch_status`, `http_status int`, `error text`, `requested_by → auth.users`, `created_at` |

`backup_dispatches` records that a run was *asked for*, which is the one thing a
run's own rows cannot say: a schedule that stopped firing looks exactly like a
schedule with nothing to do.

## `backup_storage_accounts` / `backup_storage_secrets`

The Azure destination dumps are written to — **one record shared by every
target** that points at it, so the account key is entered once and rotated once.
`backup_targets.storage_id` is the reference, `on delete set null`: removing a
destination must not delete the record of the databases that were being backed up
to it.

`backup_storage_accounts` RLS: read = any authenticated user (an account and
container name are not secret), writes = `editor`/`admin`.
`backup_storage_secrets` has **RLS on with no policies** — service-role only,
like every other secrets table here.

| table | columns |
| --- | --- |
| `backup_storage_accounts` | `id`, `name`, `account_name`, `container`, `notes`, timestamps |
| `backup_storage_secrets` | `storage_id uuid pk → backup_storage_accounts`, `connection_string`, timestamps |

Because the container is shared, `backup_targets.blob_prefix` gives each target
its own folder inside it; retention deletes by age within that prefix. It is
derived from the target's name at creation and then fixed — renaming a target
would otherwise orphan everything under the old prefix.

## `backup_runs` / `backup_run_events`

What the app's backup runner did. One `backup_runs` row per dump attempt, grouped
into a batch per triggering (18 databases at 02:00 is one `batch_id`), and one
`backup_run_events` row per step — which is what the log panel renders, so the
lines survive a reload and a run nobody watched.

The **blobs in Azure are the backups**; these tables are the record about them.
Deleting a dump removes the blob and keeps the row: that a backup was taken, and
then deleted, is history worth having.

RLS: read = any authenticated user. **No write policies at all** — every write
comes from the runner via the service-role client, because a scheduled run has no
session to write as.

| table | columns |
| --- | --- |
| `backup_runs` | `id`, `target_id → backup_targets`, `batch_id uuid`, `database_name`, `blob_name`, `size_bytes bigint`, `duration_ms int`, `status backup_run_status`, `error`, `source backup_dispatch_source`, `requested_by → auth.users`, `started_at`, `finished_at` |
| `backup_run_events` | `id bigserial`, `batch_id uuid`, `target_id → backup_targets`, `type text`, `database_name`, `message`, `created_at` |

`backup_run_status` is `running` \| `success` \| `failed`. A `running` row older
than three hours is treated as a dead container rather than a live run, or a
target whose container was killed mid-dump could never be backed up again.

## `projects`

Phase 2. One row per deployable project/app (e.g. `CHEXCALIBUR`). Grouping is
via **tags** (many-to-many, see below), not a single client field. No
project-level repo or CI/CD — CI/CD is per-environment. RLS reuses
`current_user_role()`: read = any authenticated user, insert/update =
`editor`/`admin`, delete = `admin` only.

| column          | type          | notes                                             |
| --------------- | ------------- | ------------------------------------------------- |
| `id`            | `uuid`        | primary key                                       |
| `name`          | `text`        | e.g. `CHEXCALIBUR`                                |
| `slug`          | `text`        | unique, url-safe                                  |
| `description`   | `text`        | short summary                                     |
| `archived`      | `boolean`     | soft-delete flag                                  |
| `archived_at`   | `timestamptz` | when archived                                     |
| `created_by`    | `uuid`        | FK → `auth.users`, `on delete set null`           |
| `created_at`    | `timestamptz` | default `now()`                                   |
| `updated_at`    | `timestamptz` | `set_updated_at` trigger                          |

## `tags` / `project_tags`

Phase 2. `tags` is the global list of tag names (unique); `project_tags` is the
many-to-many join to `projects` (composite PK, cascade on both FKs). Read = any
authenticated user; write = `editor`/`admin`.

| table          | columns                                                        |
| -------------- | -------------------------------------------------------------- |
| `tags`         | `id uuid pk`, `name text unique`, `created_at`                 |
| `project_tags` | `project_id → projects`, `tag_id → tags`, PK(`project_id`,`tag_id`) |

## `environments`

Phase 2. Zero-to-many per project; deleting a project cascades. Same
role-based RLS as `projects` (writes = `editor`/`admin`).

| column          | type          | notes                                            |
| --------------- | ------------- | ------------------------------------------------ |
| `id`            | `uuid`        | primary key                                      |
| `project_id`    | `uuid`        | FK → `projects.id`, `on delete cascade`          |
| `name`          | `environment_name` | enum: `DEV` / `STAGE` / `PRODUCTION`        |
| `cicd_provider` | `text`        | overrides the project default                    |
| `jenkins_url`   | `text`        | Jenkins job URL (secret token lives in `environment_secrets`) |
| `jenkins_username` | `text`     | Jenkins Basic-auth username (non-secret)         |
| `deploy_url`    | `text`        | live/deployed URL. Asked for (and the card's **Live** link shown) only on **non-Jenkins** providers: a Jenkins environment's address comes from its Jenkins wiring and its records' own domains |
| `vm_id`         | `uuid`        | FK → `vms.id`, `on delete set null` (optional); its IPs are what the records table's Link column is built from |
| `notes`         | `text`        | free text                                        |
| `position`      | `integer`     | display order within the project                 |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger             |

## `endpoints`

**The one URL table.** Every URL in the app is a row here — the tracker's
endpoints and the projects pages' deployed records both read and write this
table, so a URL added to a project environment shows up in the VM tracker with
no second copy anywhere. It began as `environment_ports`, was renamed and
widened, and `vm_urls` was folded into it (see
`…_unify_urls_into_endpoints.sql`).

**Exactly one parent**, enforced by the `endpoints_one_parent` CHECK
(`num_nonnulls(environment_id, vm_id) = 1`):

- `environment_id` set — **a project's record.** The VM it appears on is
  *derived* from `environments.vm_id` at read time, never copied onto the row:
  move an environment to another host and its endpoints follow, with no second
  value to fall out of step. A managed-platform environment (Amplify/AWS/Azure)
  has no VM, so its records never appear in the tracker — correct, there is no
  machine.
- `vm_id` set — **a VM-owned endpoint**, added from the tracker for a machine
  with no project behind it. Cascade-deletes with the VM, as `vm_urls` did.

Who may do what, by owner (enforced in `vmService`/`environmentService`, hidden
in the UI):

| | add | edit | delete |
| --- | --- | --- | --- |
| project record | the project's environment only | either page | the project's environment only |
| VM-owned | the tracker only | either page | the tracker only |

Adding a project record for a port the tracker already holds as a VM-owned row
**adopts** that row (same id, DNS/tested/notes kept) rather than inserting a
second one — see
[tracker.md](./tracker.md#urls-live-in-one-table-shared-with-projects). There is
no unique constraint behind it: one host legitimately serves several domains on
one port, so uniqueness is a judgement the service makes, not a key.

`source` records provenance: `manual` (typed by hand), `jenkins` (the Phase 2b
sync, or "Use" in the browse-jobs dialog), or `docker` (imported from a pasted
`docker ps` — see [docker-import.md](./docker-import.md)).

| column           | type          | notes                                   |
| ---------------- | ------------- | --------------------------------------- |
| `id`             | `uuid`        | primary key                             |
| `environment_id` | `uuid`        | FK → `environments.id`, `on delete cascade`; null on a VM-owned row |
| `vm_id`          | `uuid`        | FK → `vms.id`, `on delete cascade`; null on a project record |
| `port`           | `text`        | e.g. `3000` — shown for port-bearing providers |
| `branch`         | `text`        | e.g. `main` — the deployed branch, shown **instead of** `port` on `aws`/`azure`/`amplify` (`providerHasBranch`) |
| `protocol`       | `net_protocol`| HTTP/HTTPS/TCP/UDP/WS/WSS               |
| `description`    | `text`        | the record's label — surfaced as the projects table's **Name** column |
| `domain`         | `text`        | where it answers, e.g. `dev.imaui.upview.tech` (was `vm_urls.url`) |
| `dns`            | `boolean`     | DNS updated? — the tracker's migration checklist |
| `tested`         | `boolean`     | endpoint tested?                        |
| `notes`          | `text`        | free text (distinct from `description`, which is the name) |
| `source`         | `port_source` | `manual` \| `jenkins` \| `docker`        |
| `jenkins_job_url`| `text`        | Jenkins job this record represents (non-secret; powers per-record "Run build") |
| `position`       | `integer`     | display order within its parent         |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger     |

RLS: read = any authenticated user; insert/update/delete = `editor`/`admin` —
adding or removing a URL row is ordinary editing work in either view.

## `environment_build_runs`

Phase 2b · build history. One row per Jenkins build **triggered from this app**:
which job, who started it, and how it ended. This is what makes running a build
attributable — and why triggering one is open to **viewers** (see
[jenkins-sync.md](./jenkins-sync.md) and `canRunBuild` in
[`lib/rbac.ts`](../lib/rbac.ts)).

RLS: read = any authenticated user (the trail is for the team); insert = any
authenticated user but **only as themselves** (`triggered_by = auth.uid()`);
update = **own rows only**, since the poller that follows a run belongs to
whoever started it; delete = `admin`. Nobody can rewrite someone else's row.

| column               | type                    | notes                                                |
| -------------------- | ----------------------- | ---------------------------------------------------- |
| `id`                 | `uuid`                  | primary key                                          |
| `environment_id`     | `uuid`                  | FK → `environments.id`, `on delete cascade`          |
| `port_id`            | `uuid`                  | FK → `endpoints.id`, `on delete set null` — the record it was run from; what the per-record history filters on |
| `job_url`            | `text`                  | the Jenkins job that was built                       |
| `job_name`           | `text`                  | label snapshot (the record's name, else derived from the URL) |
| `queue_url`          | `text`                  | Jenkins queue item — the handle on *this* run at trigger time |
| `build_url`          | `text`                  | filled in once an executor picks the run up          |
| `build_number`       | `integer`               | nullable until the build exists                      |
| `phase`              | `jenkins_run_phase`     | enum: `QUEUED`/`RUNNING`/`DONE`/`CANCELLED`/`UNKNOWN` (mirrors `JENKINS_RUN_PHASES`) |
| `result`             | `jenkins_build_status`  | enum, `DONE` only (mirrors `JENKINS_STATUSES`)       |
| `triggered_by`       | `uuid`                  | FK → `auth.users`, `on delete set null`              |
| `triggered_by_email` / `triggered_by_name` | `text`    | who ran it, **denormalised**: `profiles` is only readable by its owner, so a join would hide other users' names from a viewer |
| `finished_at`        | `timestamptz`           | set when the run reaches a terminal phase            |
| `created_at` / `updated_at` | `timestamptz`    | `set_updated_at` trigger; `created_at` is the run's start |

## `project_docs`

Phase 2 · M2. One row per project (1-to-1, `project_id` is the PK and cascades
on project delete). Holds the project's documentation as a Tiptap document:
`content_json` is canonical and re-editable; `content_html` is a server-derived
copy for cheap read-only rendering to viewers. Same role-based RLS as projects
(read = any authenticated user, write = `editor`/`admin`). See
[ai-docs.md](./ai-docs.md).

| column            | type          | notes                                        |
| ----------------- | ------------- | -------------------------------------------- |
| `project_id`      | `uuid`        | PK, FK → `projects.id`, `on delete cascade`  |
| `content_json`    | `jsonb`       | canonical Tiptap document JSON               |
| `content_html`    | `text`        | rendered HTML (derived from JSON server-side) |
| `generated_by_ai` | `boolean`     | last save came from the “Generate by AI” flow |
| `updated_by`      | `uuid`        | FK → `auth.users`, `on delete set null`      |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger           |

## `app_settings`

Phase 2 · M2. A **singleton** (`id boolean primary key default true
check (id)` enforces the single row) holding admin-configured global values:
the Gemini AI key/model/house-style prompt. RLS is **admin-only** for
select/insert/update — the secret (`gemini_api_key`) never travels to a
non-admin. Server routes that need it for a non-admin caller (the AI “Generate
by AI” flow) read it via the **service-role** client, which bypasses RLS; the
value is used to call Gemini and never returned to the browser (the settings
service masks it to a boolean, and the key field is write-only in the UI). An
MVP fallback reads `GEMINI_API_KEY` from the server env if the row is unset.
Jenkins is configured **per-environment**, not here (see `environment_secrets`).
See [settings.md](./settings.md) and [ai-docs.md](./ai-docs.md).

| column             | type          | notes                                       |
| ------------------ | ------------- | ------------------------------------------- |
| `id`               | `boolean`     | PK, `default true check (id)` — single row  |
| `gemini_api_key`   | `text`        | **secret** — read server-side only          |
| `gemini_model`     | `text`        | default `gemini-2.5-flash`                  |
| `ai_style_prompt`  | `text`        | house-style instructions for consistent docs |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger           |

## `environment_secrets`

Phase 2b · M3. The **secret** per-environment Jenkins API token, split out from
`environments` because that table is readable by every authenticated user (a
token there would leak). RLS is **enabled with no policies**, so no
authenticated client can read or write it — only the **service-role** client
(server-side, behind an editor/admin check) touches it. The non-secret Jenkins
job URL + username live on `environments` (`jenkins_url`, `jenkins_username`).
See [jenkins-sync.md](./jenkins-sync.md).

| column              | type          | notes                                      |
| ------------------- | ------------- | ------------------------------------------ |
| `environment_id`    | `uuid`        | PK, FK → `environments.id`, `on delete cascade` |
| `jenkins_api_token` | `text`        | **secret** — read server-side only         |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger           |

## Migration files

In `supabase/migrations/`, applied in timestamp order:

- `…_helpers.sql` — shared `set_updated_at()` trigger function. Applies first.
- `…_create_profiles_table.sql` — `profiles` table, RLS "read own profile"
  policy, the `handle_new_user` trigger, and a backfill from `auth.users`.
- `…_create_vms_table.sql` — `vms` table, shared-access RLS, `set_updated_at`
  trigger. (RLS later tightened — see
  `…_restrict_vm_tracker_writes.sql` below.)
- `…_create_vm_urls_table.sql` — `vm_urls` table, FK to `vms` (cascade),
  shared-access RLS, `set_updated_at` trigger. (RLS later tightened, as above.)
- `…_add_profiles_role.sql` — Phase 2 RBAC: `profiles.role`
  (`admin`/`editor`/`viewer`), the `current_user_role()` helper, and admin
  read/update policies on `profiles`.
- `…_create_projects_table.sql` — `projects` table, role-based RLS,
  `set_updated_at` trigger.
- `…_create_environments_tables.sql` — `environments` + `environment_ports`
  tables (FK cascade to `projects`, optional FK to `vms`), role-based RLS,
  `set_updated_at` triggers.
- `…_convert_fixed_values_to_enums.sql` — replaces the `text` + `CHECK`
  fixed-value columns with the `user_role`, `cicd_provider`, `net_protocol`,
  and `port_source` enum types.
- `…_constrain_environment_names.sql` — `environments.name` becomes the
  `environment_name` enum (`DEV`/`STAGE`/`PRODUCTION`); existing values are
  normalized first.
- `…_project_tags_and_drop_client_repo_cicd.sql` — adds `tags` + `project_tags`
  (migrating existing `client` values into tags) and drops `projects.client`,
  `projects.repo_url`, `projects.cicd_provider`.
- `…_create_app_settings_table.sql` — the `app_settings` singleton (admin-only
  RLS, seeded with one row), holding the Gemini configuration.
- `…_create_project_docs_table.sql` — the `project_docs` table (1-to-1 with a
  project, cascade delete), storing Tiptap JSON + rendered HTML with role-based
  RLS.
- `…_environment_jenkins_secrets.sql` — adds `environments.jenkins_username` and
  the `environment_secrets` table (per-environment Jenkins API token; RLS on
  with no policies, so it's service-role-only).
- `…_add_jenkins_job_url_to_ports.sql` — adds `environment_ports.jenkins_job_url`
  so a record can represent a specific Jenkins job (non-secret, powers the
  per-record "Run build").
- `…_add_domain_to_environment_ports.sql` — adds `environment_ports.domain`, the
  assigned domain/host for a record.
- `…_add_docker_port_source.sql` — adds `docker` to the `port_source` enum, for
  records imported from a pasted `docker ps`.
- `…_add_branch_to_environment_ports.sql` — adds `environment_ports.branch`, the
  deployed branch for managed-platform records that have no host port.
- `…_create_environment_build_runs.sql` — the `jenkins_run_phase` and
  `jenkins_build_status` enums plus `environment_build_runs`, the audit trail of
  triggered builds (insert/update restricted to the run's own user).
- `…_create_backup_services_table.sql` — the first cut of the Backups registry
  (a worker URL and an optional FK to `vms`). Reshaped by the next two.
- `…_backup_targets_config.sql` — renames it to `backup_targets`, drops `vm_id`,
  adds the MySQL/Azure/retention/schedule columns, and adds
  `backup_target_secrets` (service-role only) plus the `backup_dispatches` audit.
  See [`backup_targets`](#backup_targets--backup_target_secrets--backup_dispatches).
- `…_backup_schedule_cron.sql` — enables `pg_cron` + `pg_net` and adds
  `sync_backup_target_schedule()` with the triggers that keep one cron job per
  target in step with its row.
- `…_backup_runs_in_app.sql` — `backup_runs` + `backup_run_events`: the app now
  performs the dumps itself (streamed into Azure, nothing on disk) and owns the
  history and the progress log. See
  [`backup_runs`](#backup_runs--backup_run_events).
- `…_backup_storage_accounts.sql` — `backup_storage_accounts` +
  `backup_storage_secrets`, `backup_targets.storage_id` and `blob_prefix`, with
  the existing per-target Azure configuration migrated into one shared account.
  See [`backup_storage_accounts`](#backup_storage_accounts--backup_storage_secrets).
- `…_backup_cron_calls_app.sql` — re-points every cron job from the
  `backup-dispatch` Edge Function to the app's own `/api/backups/cron`, and drops
  the `worker_url` condition from the schedule sync.
- `…_backup_cron_test.sql` — `backup_cron_diagnostics()`, `backup_cron_ping()`
  and `backup_cron_ping_result()`: `security definer`, `service_role`-only, so
  the app can read its own pg_cron job and send one test request down the path a
  firing job takes. See [backups.md § Test schedule](./backups.md#test-schedule).
- `…_backups_admin_only_writes.sql` — makes the Backups tab admin-write and
  everyone-read: replaces the editor/admin write policies on `backup_targets`
  and `backup_storage_accounts` with admin-only ones, and drops the
  `backup_dispatches` insert policy (those rows are written service-role, for
  pg_cron's benefit). See
  [backups.md § Permissions](./backups.md#permissions).
- `…_backup_cron_job_function.sql` — moves the job's body into
  `run_backup_cron_job()`, which raises a readable error when a Vault secret is
  missing instead of letting pg_net fail on a null URL.
- `…_vm_jenkins_credentials.sql` — `vm_jenkins` + `vm_jenkins_secrets`: the
  Jenkins server, user and token move from each environment onto the **VM** that
  runs them, seeded from the most recently updated configured environment per VM
  (its token included). See [`vm_jenkins`](#vm_jenkins--vm_jenkins_secrets).
- `…_unify_urls_into_endpoints.sql` — **one URL table.** Renames
  `environment_ports` to `endpoints`, adds `vm_id`/`dns`/`tested`/`notes` and the
  exactly-one-parent CHECK, folds every `vm_urls` row in (merging those that
  describe the same endpoint as a project record — same VM, same port, same
  protocol — one-to-one, and carrying the checklist over), then drops `vm_urls`.
  See [`endpoints`](#endpoints).
- `…_create_vm_groups_table.sql` — the `vm_groups` table plus `vms.group_id`
  (FK, `on delete set null`) and its index: the tracker's one-to-many grouping.
  See [`vm_groups`](#vm_groups).
- `…_restrict_vm_tracker_writes.sql` — replaces the Phase 1 "any authenticated
  user has full access" policies on `vms` and `vm_urls` with the standard role
  split, making the tracker **read-only for viewers**. See
  [`vms`](#vms) and [`endpoints`](#endpoints).

## Deploying migrations

One-time setup: `supabase login`, then `supabase link --project-ref <ref>`.
Then apply pending migrations to the remote database:

```bash
supabase db push
```

(For local development against the CLI stack, use `supabase db reset` or
`supabase migration up` instead.)

## Adding a table

1. Create the migration with `supabase migration new create_<name>_table`,
   which writes a timestamped `.sql` file to `supabase/migrations/`.
2. Enable RLS and add the policies the app needs.
3. If the table has an `updated_at` column, attach the `set_updated_at`
   trigger from the helpers migration.
4. Add matching types under `types/supabase/response/<name>/` and, where
   useful, a domain type under `types/common/`.
5. Apply it with `supabase db push` and update this doc to describe the new
   table.
