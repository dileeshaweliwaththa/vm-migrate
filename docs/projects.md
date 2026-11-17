# Projects

The **Projects** tab is where each deployable app lives: its environments
(DEV / STAGE / PRODUCTION), the records deployed in each one, how each is
built and deployed, and its documentation.

- `/projects`: a card per project, filtered by **tag**. Admins can also show
  archived projects.
- `/projects/[id]`: one project. A switch flips between **Environments** and
  **Documentation**.

Neighbouring docs cover the parts with their own rules:
[jenkins-sync.md](./jenkins-sync.md) (Jenkins config, builds, port sync),
[docker-import.md](./docker-import.md) (records from `docker ps`),
[github.md](./github.md) (repository and branch pickers),
[ai-docs.md](./ai-docs.md) (the documentation section), and
[tracker.md](./tracker.md) (records are rows of the same `endpoints` table the
VM tracker uses).

## Layers

| Layer | Files |
| --- | --- |
| Routing | `app/(protected)/(app)/projects/page.tsx`, `projects/[id]/page.tsx` (a 404 for an unknown id), `app/api/projects/**/route.ts`, `app/api/tags/route.ts` |
| UI | `components/projects/projects-dashboard.tsx`, `project-detail.tsx`, `project-dialog.tsx`, `tag-picker.tsx`; `components/environments/*` (the environment cards, their records table and dialogs) |
| Hook | `hooks/projects/useProjects.ts`, `hooks/environments/useEnvironments.ts`, `useEnvironmentJenkins.ts` |
| Service | `services/projects/projectService.ts` (+ `mappers.ts`), `services/environments/environmentService.ts`, `services/tags/tagService.ts` |
| Repository | `repositories/projects/projectRepository.ts`, `repositories/environments/environmentRepository.ts`, `repositories/endpoints/endpointRepository.ts`, `repositories/tags/tagRepository.ts` |

## Data

The tables are described in [schema.md](./schema.md#projects); in short:

| Table | Holds |
| --- | --- |
| `projects` | name, unique `slug`, description, `archived` + `archived_at` |
| `tags` / `project_tags` | the global tag list, and which tags each project has (many-to-many) |
| `environments` | per project: the stage, an optional label, its CI/CD provider, an optional VM |
| `endpoints` | the records: each row has exactly one parent, an environment or a VM |

**Tags, not a client field.** Grouping is by tag, so one project can sit under
a client *and* a product line. Tags are normalised on every save (trimmed,
empty ones dropped, de-duplicated without regard to case) and the project's
set is replaced, not merged. A tag that no project uses any more stays in
`tags`.

**The stage is an enum.** `environments.name` is the `environment_name` type:
`DEV`, `STAGE` or `PRODUCTION` (`ENVIRONMENT_NAMES` in TS, same order). A
project with two environments in one stage tells them apart by `label`
(`DEV · CSE UAT`); `environmentTitle` in [lib/endpoints.ts](../lib/endpoints.ts)
composes the two.

**CI/CD is per environment.** Each environment picks its provider
(`CICD_PROVIDERS`), and the provider decides which columns its records table
shows (see [jenkins-sync.md § Records by provider](./jenkins-sync.md#records-by-provider)).

**Records are endpoints.** A record is a row of `endpoints` with
`environment_id` set, so it also shows on the linked VM in the tracker. Adding
a record for a port the tracker already holds as a VM-owned row **adopts** that
row instead of inserting a second one
([tracker.md](./tracker.md#urls-live-in-one-table-shared-with-projects)).

## Rules

- **Slugs** come from the name unless one is given, and are unique. If the
  slug is taken, a short suffix is added and the insert is tried once more.
- **Archiving** is a soft delete: `archived = true` with a timestamp, reversible
  from the same menu. Archived projects are listed for **admins only**.
  `listProjects` re-checks the caller's real role, so `?archived=true` from an
  editor or viewer returns the active list.
- **Deleting** a project is permanent and admin-only. It cascades to its
  environments and their records.
- **A detail page checks its row first.** An unknown or malformed id renders
  the in-shell 404 ([architecture.md § Errors](./architecture.md#errors-and-not-found)).

## Permissions

| Action | Minimum role |
| --- | --- |
| See projects, environments, records, docs; run a Jenkins build and see its history | `viewer` |
| Create or edit a project, its tags, environments and records; archive or restore; configure and sync Jenkins; import from `docker ps`; edit docs | `editor` |
| See archived projects; delete a project | `admin` |

RLS enforces the write rules on every table here (insert/update = editor or
admin, delete = admin), and the project and environment services rely on it.
Jenkins actions are re-checked in `jenkinsService` because they reach a
service-role secret. See [rbac.md](./rbac.md) for the role model and
[auth.md](./auth.md#where-access-is-enforced) for where each check runs.

## API

| Method + path | Action |
| --- | --- |
| `GET  /api/projects` | list (`?archived=true` adds archived ones, for admins) |
| `POST /api/projects` | create |
| `GET  /api/projects/:id` | one project with its environments and records |
| `PATCH /api/projects/:id` | update name, slug, description, tags |
| `DELETE /api/projects/:id` | delete (admin) |
| `POST /api/projects/:id/archive` | archive, or restore with `{ archived: false }` |
| `GET` / `PUT /api/projects/:id/docs` | the documentation ([ai-docs.md](./ai-docs.md)) |
| `POST /api/projects/:id/environments` | add an environment |
| `PATCH` / `DELETE /api/projects/:id/environments/:envId` | edit or remove one |
| `POST /api/projects/:id/environments/:envId/ports` | add a record |
| `PATCH` / `DELETE …/ports/:portId` | edit or remove a record |
| `GET …/ports/:portId/jenkins-source` | the repository and branch a Jenkins-linked record builds from |
| `…/jenkins-config`, `jenkins-jobs`, `jenkins-link`, `jenkins-build`, `jenkins-run`, `jenkins-runs`, `jenkins-sync` | Jenkins: see [jenkins-sync.md](./jenkins-sync.md) |
| `POST …/docker-parse` | parse a `docker ps` paste ([docker-import.md](./docker-import.md)) |
| `GET  /api/tags` | every tag name, for the picker |
