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

Phase 2. One row per deployable project/app. Flat model — `client` is a
free-text tag for grouping/filtering, not a hierarchy. RLS reuses
`current_user_role()`: read = any authenticated user, insert/update =
`editor`/`admin`, delete = `admin` only.

| column          | type          | notes                                             |
| --------------- | ------------- | ------------------------------------------------- |
| `id`            | `uuid`        | primary key                                       |
| `name`          | `text`        | e.g. `chex-api`                                   |
| `slug`          | `text`        | unique, url-safe                                  |
| `client`        | `text`        | tag (CHEX/INAI/KOMPETE/UPVIEW/…)                  |
| `description`   | `text`        | short summary                                     |
| `repo_url`      | `text`        | optional                                          |
| `cicd_provider` | `text`        | `jenkins`/`aws`/`azure`/`amplify`/`other`/`none`  |
| `archived`      | `boolean`     | soft-delete flag                                  |
| `archived_at`   | `timestamptz` | when archived                                     |
| `created_by`    | `uuid`        | FK → `auth.users`, `on delete set null`           |
| `created_at`    | `timestamptz` | default `now()`                                   |
| `updated_at`    | `timestamptz` | `set_updated_at` trigger                          |

## `environments`

Phase 2. Zero-to-many per project; deleting a project cascades. Same
role-based RLS as `projects` (writes = `editor`/`admin`).

| column          | type          | notes                                            |
| --------------- | ------------- | ------------------------------------------------ |
| `id`            | `uuid`        | primary key                                      |
| `project_id`    | `uuid`        | FK → `projects.id`, `on delete cascade`          |
| `name`          | `text`        | dev / staging / prod / custom                    |
| `cicd_provider` | `text`        | overrides the project default                    |
| `jenkins_url`   | `text`        | Jenkins job URL                                  |
| `deploy_url`    | `text`        | live/deployed URL                                |
| `vm_id`         | `uuid`        | FK → `vms.id`, `on delete set null` (optional)   |
| `notes`         | `text`        | free text                                        |
| `position`      | `integer`     | display order within the project                 |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger             |

## `environment_ports`

Phase 2. One row per deployed port (mirrors `vm_urls`). `source` records
provenance (`manual` now, `jenkins` after the Phase 2b sync).

| column           | type          | notes                                   |
| ---------------- | ------------- | --------------------------------------- |
| `id`             | `uuid`        | primary key                             |
| `environment_id` | `uuid`        | FK → `environments.id`, `on delete cascade` |
| `port`           | `text`        | e.g. `3000`                             |
| `protocol`       | `text`        | HTTP/HTTPS/TCP/UDP/WS/WSS               |
| `description`    | `text`        | e.g. "API"                              |
| `source`         | `text`        | `manual` \| `jenkins`                   |
| `position`       | `integer`     | display order                           |
| `created_at` / `updated_at` | `timestamptz` | `set_updated_at` trigger     |

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
