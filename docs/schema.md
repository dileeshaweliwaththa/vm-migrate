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
`net_protocol` (`environment_ports.protocol`), `port_source`
(`environment_ports.source`), and `environment_name` (`environments.name` —
`DEV`/`STAGE`/`PRODUCTION`). Each mirrors a TS constant of the same values
(`USER_ROLES`, `CICD_PROVIDERS`, `PROTOCOLS`, `PORT_SOURCES`,
`ENVIRONMENT_NAMES`). The legacy
`vm_urls.proto` remains `text` for tracker-data compatibility.

`public.current_user_role()` is a `SECURITY DEFINER` helper that returns the
signed-in user's role; every Phase 2 table's RLS reuses it to gate writes
(select = any authenticated user, insert/update = editor|admin, delete =
admin). See [phase-2-plan.md](./phase-2-plan.md) §2–§3.

## `vms`

One row per virtual machine tracked through a migration. **Shared across all
authenticated users** — this is an internal team tool, so RLS grants any
signed-in user full access (not per-user ownership).

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
| `created_at`       | `timestamptz` | default `now()`                                    |
| `updated_at`       | `timestamptz` | kept fresh by the `set_updated_at` trigger         |

## `vm_urls`

Endpoints belonging to a VM (port + protocol + domain). Deleting a VM cascades
to its URLs. Same shared-access RLS as `vms`.

| column       | type          | notes                                    |
| ------------ | ------------- | ---------------------------------------- |
| `id`         | `uuid`        | primary key                              |
| `vm_id`      | `uuid`        | FK → `vms.id`, `on delete cascade`       |
| `port`       | `text`        | e.g. `443`                               |
| `proto`      | `text`        | HTTP/HTTPS/TCP/UDP/WS/WSS                 |
| `url`        | `text`        | domain / URL                             |
| `dns`        | `boolean`     | DNS updated?                             |
| `tested`     | `boolean`     | endpoint tested?                         |
| `notes`      | `text`        | free text                                |
| `position`   | `integer`     | display order within the VM              |
| `created_at` | `timestamptz` | default `now()`                          |
| `updated_at` | `timestamptz` | kept fresh by the `set_updated_at` trigger |

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
| `deploy_url`    | `text`        | live/deployed URL                                |
| `vm_id`         | `uuid`        | FK → `vms.id`, `on delete set null` (optional)   |
| `notes`         | `text`        | free text                                        |
| `position`      | `integer`     | display order within the project                 |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger             |

## `environment_ports`

Phase 2. One row per deployed record (mirrors `vm_urls`). `source` records
provenance (`manual`, or `jenkins` when the row came from the Phase 2b sync or
from "Use" in the browse-jobs dialog).

| column           | type          | notes                                   |
| ---------------- | ------------- | --------------------------------------- |
| `id`             | `uuid`        | primary key                             |
| `environment_id` | `uuid`        | FK → `environments.id`, `on delete cascade` |
| `port`           | `text`        | e.g. `3000`                             |
| `protocol`       | `text`        | HTTP/HTTPS/TCP/UDP/WS/WSS               |
| `description`    | `text`        | the record's label — surfaced as the **Name** column (a Jenkins job name, or hand-typed) |
| `domain`         | `text`        | assigned domain/host, e.g. `dev.imaui.upview.tech` |
| `source`         | `text`        | `manual` \| `jenkins`                   |
| `jenkins_job_url`| `text`        | Jenkins job this record represents (non-secret; powers per-record "Run build") |
| `position`       | `integer`     | display order                           |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger     |

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
  trigger.
- `…_create_vm_urls_table.sql` — `vm_urls` table, FK to `vms` (cascade),
  shared-access RLS, `set_updated_at` trigger.
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
