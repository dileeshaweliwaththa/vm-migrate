# Jenkins Sync (Phase 2b · M3)

Jenkins is configured **per environment**: each environment carries its own
Jenkins job URL + credentials, and you sync ports from that job. There is no
global Jenkins connection.

## Why the token is split out

An environment's Jenkins **URL and username** are not secret, so they live on
the `environments` row (`jenkins_url`, `jenkins_username`). The **API token**
is secret, and `environments` is readable by every authenticated user under RLS
— a token there would be sent to every viewer's browser. So the token lives in
`environment_secrets`, a table with **RLS on and no policies**: no authenticated
client can read or write it. Only server code touches it, via the service-role
client, behind an editor/admin check. See [schema.md](./schema.md) and
AGENTS.md §6.

## Layers

| Layer      | File                                                        |
| ---------- | ----------------------------------------------------------- |
| Routing    | `app/api/projects/[id]/environments/[envId]/jenkins-config/route.ts` (GET/PUT), `.../jenkins-sync/route.ts` (POST) |
| UI         | `components/environments/jenkins-config-dialog.tsx` (modal), per-env buttons in `components/environments/environments-section.tsx` |
| Hook       | `hooks/environments/useEnvironmentJenkins.ts` (config), `hooks/environments/useEnvironments.ts` (`syncFromJenkins`) |
| Service    | `services/jenkins/jenkinsService.ts`, `services/jenkins/extraction.ts` |
| Repository | `repositories/jenkins/jenkinsRepository.ts` (external HTTP), `repositories/environmentSecrets/environmentSecretRepository.ts` (service-role) |

`jenkinsRepository` is the **one external-HTTP data source** — the documented
exception to "repositories only touch Supabase" (architecture.md / AGENTS.md §2).

## Flow

On a project page, each environment whose CI/CD provider is **Jenkins** shows
(editor+):

1. **Jenkins settings** (⚙) — opens a modal to set the **Job URL** (a specific
   job, or just the server base URL), **Username**, and **API token**
   (write-only; masked once stored). URL + username save to the environment; the
   token saves to `environment_secrets`.
2. **Browse jobs** (list icon, shown once a URL is set) — lists **all jobs on
   the server** (the base is derived from the Job URL, so a bare base URL is
   enough to browse). For each job it shows status (from `color` + last build
   result), last build #/time, and description, with:
   - **Run** — triggers a build (POST `{jobUrl}/build` with a CSRF crumb),
     behind a confirm. Needs `Job → Build` permission.
   - **Use** — adds the job as a **record in the environment's ports table**
     (`source='jenkins'`, description from the job, job URL stored on the row,
     port left blank). The dialog stays open so several jobs can be added.
3. **Sync from Jenkins** (⟳) — reads the job's `config.xml` and refreshes only
   the `jenkins`-sourced ports (manual entries preserved).
4. **Records** — each row in the ports table is editable inline (fill in the
   **port** later, tweak protocol/description) and, when it carries a Jenkins
   job, shows a **Run build** ▶ action and a deep link to the job.

The token is read server-side only (service-role), so a non-admin **editor** can
configure, browse, run, and sync without ever seeing it — mirrors the AI
"Generate by AI" flow. Build triggers and job links are SSRF-guarded: the target
job URL must belong to the same Jenkins server the environment points at.

## Port & CI/CD extraction (D3)

Jenkins doesn't expose "deployed ports" natively — they live in Dockerfiles,
deploy scripts, and build commands. `extraction.ts` scans the job config text
for common patterns (`docker -p host:container`, `EXPOSE`, k8s `containerPort`,
`server.port`, `--port`, `PORT=`) and records unique plausible ports (protocol
inferred, default `HTTPS`). Best-effort: if a job's config can't be read, the
sync says so rather than failing silently (see phase-2-plan.md §10).

## Limitations

- Extraction reads `.../job/NAME/config.xml`, which in Jenkins requires the
  authenticating user to have **Job → Extended Read** (or Admin) permission — a
  plain `Job/Read` user gets a **403** even with valid credentials. The sync
  reports the exact HTTP status (401 auth / 403 permission / 404 wrong URL /
  network) so the cause is clear.
- The sync only adds/updates jenkins-sourced ports; it never deletes manual
  ports.
- Untested against a live Jenkins instance in this build — validate on a real
  server before relying on it.
