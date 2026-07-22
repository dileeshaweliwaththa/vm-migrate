# Data Model

Supabase tables are **never** created or altered by application code or by
migrations run from the app. Every schema change is a plain `.sql` file in
[`sql/`](../sql), applied **manually** in the Supabase SQL Editor in numeric
order. The `sql/` folder is not imported by the app and is excluded from both
the Next.js build (`next.config.ts`) and the TypeScript project
(`tsconfig.json`).

## `profiles`

One row per `auth.users` entry, created automatically by the
`on_auth_user_created` trigger on sign-up. Extend this table with the columns
your app needs.

| column       | type          | notes                              |
| ------------ | ------------- | ---------------------------------- |
| `id`         | `uuid`        | primary key, FK → `auth.users.id`  |
| `email`      | `text`        | from sign-up                       |
| `name`       | `text`        | nullable; from sign-up metadata    |
| `created_at` | `timestamptz` | default `now()`                    |

RLS: authenticated users can read their own profile only
(`id = auth.uid()`). There is no update policy by default.

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

## SQL files

- `000_helpers.sql` — shared `set_updated_at()` trigger function. Apply first.
- `001_create_profiles_table.sql` — `profiles` table, RLS "read own profile"
  policy, the `handle_new_user` trigger, and a backfill from `auth.users`.
- `002_create_vms_table.sql` — `vms` table, shared-access RLS, `set_updated_at`
  trigger.
- `003_create_vm_urls_table.sql` — `vm_urls` table, FK to `vms` (cascade),
  shared-access RLS, `set_updated_at` trigger.

## Adding a table

1. Create the next numbered file, e.g. `sql/002_create_<name>_table.sql`,
   written so it can be pasted directly into the Supabase SQL Editor.
2. Enable RLS and add the policies the app needs.
3. If the table has an `updated_at` column, attach the `set_updated_at`
   trigger from `000_helpers.sql`.
4. Add matching types under `types/supabase/response/<name>/` and, where
   useful, a domain type under `types/common/`.
5. Update this doc to describe the new table.
