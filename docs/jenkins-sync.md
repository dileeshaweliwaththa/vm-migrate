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

## Who can do what

Two levels, not one:

| Action                                                   | Required        |
| -------------------------------------------------------- | --------------- |
| Jenkins settings, browse-jobs dialog, "Use", port sync, linking a job, deleting a record | `canEdit` (editor/admin) |
| **Run a build**, follow it, see job status / last build, read the build history | `canRunBuild` — **every** signed-in role, viewers included |

Triggering a deploy job is an everyday action for the whole team, so it isn't
editor-only. What replaces that gate is attribution: every trigger writes a row
to `environment_build_runs` recording the user who started it, so a build is
never anonymous. Configuration — anything that changes credentials, records, or
ports — stays editor+.

Both helpers live in [`lib/rbac.ts`](../lib/rbac.ts); no route or component
re-derives them from role strings.

## Layers

| Layer      | File                                                        |
| ---------- | ----------------------------------------------------------- |
| Routing    | `app/api/projects/[id]/environments/[envId]/jenkins-config/route.ts` (GET/PUT), `.../jenkins-sync/route.ts` (POST), `.../jenkins-jobs/route.ts` (GET), `.../jenkins-build/route.ts` (POST), `.../jenkins-link/route.ts` (POST), `.../jenkins-run/route.ts` (GET — build progress), `.../jenkins-runs/route.ts` (GET — build history, `?portId=` for one record) |
| UI         | `components/environments/jenkins-config-dialog.tsx` (modal), `jenkins-jobs-dialog.tsx` (browse), `jenkins-history-dialog.tsx` (per-record build history), `jenkins-status.tsx` (status + run pills), per-env buttons + record rows in `components/environments/environments-section.tsx` |
| Hook       | `hooks/environments/useEnvironmentJenkins.ts` (config, job list, trigger, run progress, history), `hooks/environments/useEnvironments.ts` (`syncFromJenkins`) |
| Service    | `services/jenkins/jenkinsService.ts`, `services/jenkins/extraction.ts` |
| Repository | `repositories/jenkins/jenkinsRepository.ts` (external HTTP), `repositories/environmentSecrets/environmentSecretRepository.ts` (service-role), `repositories/environmentBuildRuns/environmentBuildRunRepository.ts` (build history) |

`jenkinsRepository` is the **one external-HTTP data source** — the documented
exception to "repositories only touch Supabase" (architecture.md / AGENTS.md §2).

## Flow

On a project page, each environment whose CI/CD provider is **Jenkins** shows
(editor+ unless noted):

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
   job, shows a **Run build** ▶ action and a deep link to the job. The ▶ action
   and the live Status / Last build columns are visible to **any** signed-in
   role; inline editing and delete stay editor+. A viewer's row therefore shows
   the actions column only when there is a job to run in it.

   **Status and Last build only exist on Jenkins cards.** They're read from a
   job's colour and its last build, and no other provider has a job to read them
   from, so those cards skip the two columns rather than showing permanent dashes.
   The job-list poll is gated on the same condition, so a record that kept a stale
   job URL after the provider was switched away stops polling a server the card no
   longer uses. Which columns each provider gets is set out under
   [Records by provider](#records-by-provider).
5. **Build history** (🕘 per record, any signed-in role) — that record's own runs,
   newest first: build number, status, **who started it**, when, and how long it
   took. It sits next to ▶ Run because they are the same unit of work: one record,
   one job, one history.

## Records by provider

The records table isn't one fixed shape — a record means something different per
provider, so the columns follow the provider:

| Provider              | Columns                                        | Docker import |
| --------------------- | ---------------------------------------------- | ------------- |
| `jenkins`             | Port · Name · Domain · Status · Last build     | yes           |
| `other` / `none`      | Port · Name · Domain                           | yes           |
| `aws` / `azure` / `amplify` | **Branch** · Name · Domain               | no            |

**Port and Branch are alternatives, never both.** A managed platform doesn't
deploy a port on a host — an Amplify deployment is a *branch*, AWS/Azure ones are
services behind their own endpoints — so the leading column there is the branch
that gets deployed (`environment_ports.branch`), and `docker ps`, which is nothing
but host-port mappings, has nothing to import into it. `other`/`none` keep ports:
those are the hand-tracked, VM-hosted records the docker import was built for.

The set lives in one place — `PORTLESS_PROVIDERS`, with `providerHasPorts` /
`providerHasBranch`, in [`types/common/project.ts`](../types/common/project.ts)
beside `CICD_PROVIDERS` — so no component re-lists provider names (AGENTS.md
§types). Both the record rows and the Add row follow it, including what makes
**Add** clickable: the leading column is the record's identity, so it's the port
where there are ports and the branch where there aren't.

The AI docs generator reads the same rule, so a generated doc describes a
managed-platform record by its branch instead of reporting a `port NOT RECORDED
YET` for a record that by definition has none (`recordLine` in
`services/ai/aiService.ts`).

Two consequences worth knowing:

- **Column count is computed once per card**, not per row, so the header and the
  body can't disagree about how many cells a row has.
- **Switching a provider only changes which column is shown.** `port` and `branch`
  both exist on every row, so a value hidden by a provider switch is still there
  and reappears if the provider is switched back — nothing is deleted.

## Build history

Every trigger writes a row to `environment_build_runs` (see
[schema.md](./schema.md)) with the job, the record it was started from, the queue
handle, and the user who ran it. Each poll of that run then mirrors its phase,
build number, and result onto the same row, so a finished run reads as
`#31 SUCCESS · started by …` instead of sitting at QUEUED.

The history is **per record**: `GET .../jenkins-runs?portId=…` filters to the runs
started from one row, and the dialog drops its Job column because every row is the
same job. The same endpoint without `portId` returns the whole environment's runs —
that's the shape that would also cover builds started from the browse-jobs dialog,
which have no record (`port_id` is null) and so appear in no per-record list.

Design notes:

- **The user label is denormalised** (`triggered_by_email` / `triggered_by_name`)
  rather than joined from `profiles`, which is only readable by its owner and
  admins — a join would show a viewer "—" for everyone else's runs. It also
  survives the user being deleted.
- **RLS makes the trail append-only per user**: insert only as yourself, update
  only your own rows (the poller following a run belongs to whoever started it),
  delete admin-only.
- **Recording is best-effort at trigger time.** Jenkins has already accepted the
  build by then, so a failed audit write must not report a running build as
  failed. Same for the progress mirror — the poll's job is to answer the client.
- **The history list refreshes itself** while it holds an unfinished run, but only
  while the dialog is open and only for runs started within the last hour: a run
  whose poller died (tab closed mid-build) must not keep an interval alive.
- **Query keys keep the environment prefix** (`['env-jenkins-runs', projectId,
  envId, portId]`), so one invalidate after a trigger or a finished run refreshes
  every record's history in that environment.
- Builds started **directly in Jenkins**, or by an older version of this app, have
  no row here. The coarse job status in the records table still covers those.

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

The *live* run reference is client-side (TanStack cache), so a reload mid-build
stops the precise poll and degrades to the job list's coarse `building` state.
What survives the reload is the history row: it already holds the build number,
and the last poll before the reload recorded the phase it had reached. Another
user sees the same row — that's the point of persisting it.

Polling is the right mechanism here, not a fallback: Jenkins offers no usable push
without the Notification plugin plus a publicly reachable callback URL, which an
authenticated internal tool can't provide.

The token is read server-side only (service-role), so a non-admin **editor** can
configure, browse, run, and sync — and a **viewer** can run and follow a build —
without either ever seeing it. Mirrors the AI "Generate by AI" flow. Build
triggers, job links, **and the queue/build URLs the
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
- **Credentials are per environment, and cannot be shared.**
  `environment_secrets` is keyed by `environment_id` (primary key), so ten
  environments on the same Jenkins server mean the same URL, username and token
  entered ten times — and rotating that token means editing all ten, with no way
  to list which they are. Tracked in **#80** with a proposed `jenkins_servers`
  table; the fix also removes `deriveBase()`, which only exists because
  `environments.jenkins_url` means the server root *or* the job URL depending on
  how it was set.
