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

1. **Jenkins settings** (⚙) — opens a modal to set the **Job URL**,
   **Username**, and **API token** (write-only; masked once stored). URL +
   username save to the environment; the token saves to `environment_secrets`.
2. **Sync from Jenkins** (⟳, shown once a URL is set) — reads the job's
   `config.xml` using the stored credentials, extracts ports best-effort, and
   replaces only the `jenkins`-sourced ports (manual entries are preserved).

The token is read server-side only (service-role), so a non-admin **editor** can
configure and sync without ever seeing it — mirrors the AI "Generate by AI" flow.

## Port & CI/CD extraction (D3)

Jenkins doesn't expose "deployed ports" natively — they live in Dockerfiles,
deploy scripts, and build commands. `extraction.ts` scans the job config text
for common patterns (`docker -p host:container`, `EXPOSE`, k8s `containerPort`,
`server.port`, `--port`, `PORT=`) and records unique plausible ports (protocol
inferred, default `HTTPS`). Best-effort: if a job's config can't be read, the
sync says so rather than failing silently (see phase-2-plan.md §10).

## Limitations

- Extraction depends on the job config contents and permission to read
  `config.xml`.
- The sync only adds/updates jenkins-sourced ports; it never deletes manual
  ports.
- Untested against a live Jenkins instance in this build — validate on a real
  server before relying on it.
