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
| Routing    | `app/api/projects/[id]/environments/[envId]/jenkins-config/route.ts` (GET/PUT), `.../jenkins-sync/route.ts` (POST), `.../jenkins-jobs/route.ts` (GET), `.../jenkins-build/route.ts` (POST), `.../jenkins-link/route.ts` (POST), `.../jenkins-run/route.ts` (GET — build progress) |
| UI         | `components/environments/jenkins-config-dialog.tsx` (modal), `jenkins-jobs-dialog.tsx` (browse), `jenkins-status.tsx` (status pill), per-env buttons + record rows in `components/environments/environments-section.tsx` |
| Hook       | `hooks/environments/useEnvironmentJenkins.ts` (config, job list, trigger, run progress), `hooks/environments/useEnvironments.ts` (`syncFromJenkins`) |
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
   **port** and **domain** later, tweak the name) and, when it carries a Jenkins
   job, shows a **Run build** ▶ action and a deep link to the job.

## Following a triggered build

Jenkins' build lifecycle is two-phase, and the app hides that behind a single
endpoint so neither the hook nor the component knows about queue items:

```
POST {jobUrl}/build             → 201, Location: …/queue/item/42/   ← the run's handle
GET  /queue/item/42/api/json    → { why: "Waiting for an executor" }   QUEUED
                                → { executable: { number, url } }      started
GET  {buildUrl}/api/json        → { building: true, estimatedDuration } RUNNING
                                → { building: false, result }           DONE
```

`triggerBuild` returns the `Location` header as `queueUrl` — the only handle on
*this* run as opposed to any other run of the same job. `getJenkinsRunState`
resolves queue → build in one request (so the first poll after pickup already
carries the build number and progress) and returns a single `JenkinsRunState`:
`QUEUED` / `RUNNING` / `DONE` / `CANCELLED` / `UNKNOWN`, from the shared
`JENKINS_RUN_PHASES` const.

Polling rules, all in `useJenkinsRun`:

- **Self-terminating.** `refetchInterval` returns `false` at a terminal phase, so
  no interval outlives a finished build.
- **Backs off** by poll count — ~2s for the first 15 polls, 5s to 45, then 10s. A
  flat 2s across a 20-minute build would be ~600 pointless requests.
- **Hard-capped** at 200 polls (~30 min). Past that the row keeps its last state
  and the build number remains a link into Jenkins.
- **Follows the build URL** as soon as one exists — Jenkins only retains queue
  items for a few minutes after they leave the queue. The previous state is read
  back from the query cache (keyed by the run's queue URL), so a new run on the
  same row starts from the queue again with no reset logic.
- **Quiet in background tabs** — `refetchIntervalInBackground` is left at its
  default `false`.
- **One request per card, not per row,** for the coarse case: the job list is
  refreshed on a slow 15s interval while a card has jenkins-linked records, which
  covers every row at once (Jenkins' `color` carries an `_anime` suffix while a job
  runs). That interval has to be time-based — nothing tells us a build someone
  else started has begun. Builds triggered from a row are followed precisely by
  `useJenkinsRun` instead.

The run reference is client-side only (TanStack cache). A reload mid-build
degrades to the job list's coarse `building` state rather than losing everything.
Persisting the last build number on `environment_ports` would make a run visible
to other users and survive reloads — deliberately out of scope.

Polling is the right mechanism here, not a fallback: Jenkins offers no usable push
without the Notification plugin plus a publicly reachable callback URL, which an
authenticated internal tool can't provide.

The token is read server-side only (service-role), so a non-admin **editor** can
configure, browse, run, and sync without ever seeing it — mirrors the AI
"Generate by AI" flow. Build triggers, job links, **and the queue/build URLs the
run poller follows** are all SSRF-guarded: every URL that arrives from the client
is checked against the environment's own Jenkins root before any request is made
with the token attached.

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
