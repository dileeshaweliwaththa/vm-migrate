# Jenkins Sync (Phase 2b · M3)

Jenkins is configured **per VM**, and an environment names the **job** it runs
there. There is no global Jenkins connection.

## Where Jenkins is configured

A VM runs one Jenkins, so the server, its Basic-auth user and its API token
belong to the machine: they live in
[`vm_jenkins` / `vm_jenkins_secrets`](./schema.md#vm_jenkins--vm_jenkins_secrets)
and are set from the **VM tracker** — the `J` marker on each VM row, which is
also how you see at a glance which machines run Jenkins (filled = server +
token, outlined = server but no token yet).

The address is normally just the machine's IP: `normalizeJenkinsServerUrl` adds
`http://` and port **8080** (Jenkins' default, and what these servers use). A
port or scheme that is typed is kept, so the rare server on another port still
works.

An environment then only needs its job. Its Jenkins settings modal asks for the
job and nothing else, and shows where the credentials come from, or, when the VM
has no complete server yet, says so and links to the VM. There is no
per-environment username or token (#84).

The VM dialog verifies as well as configures: `testVmJenkinsConnection` pings
the server (`pingJenkins` — `/api/json?tree=mode`, the cheapest authenticated
call) and reports what failed, and a save runs it automatically. The SSRF guard
re-runs on the address being tested, including one typed into the form.

**Resolution** (`resolveEnvJenkinsServer`) reads the environment's **VM**
(`vm_jenkins` + `vm_jenkins_secrets`) and nothing else. An environment with no
linked VM, or on a VM with no complete server, gets a message saying which part
is missing and where to set it.

Until #84 there were two fallbacks behind the VM: the environment's own
username and token (`environments.jenkins_username` + `environment_secrets`),
and a sibling environment's on the same VM. Both are gone.
`…_backfill_vm_jenkins_from_environments.sql` copied the per-environment
credentials onto the two VMs that still depended on them, and
`…_drop_environment_jenkins_credentials.sql` drops the column and the table,
refusing to run while any Jenkins environment's VM is incomplete. The deploy
order is under [Limitations](#limitations).

## One place to set the job

The **Jenkins settings** modal (⚙ on the environment card) is the *only* place
Jenkins gets configured. The Add/Edit Environment form deliberately has no
"Jenkins job URL" box — it shows a pointer to the modal instead.

A second box gave the same field two owners: a URL typed in the environment
form and a URL typed in the modal both wrote `environments.jenkins_url`, with no
ordering between them, and only the modal's path ran `isDeniedJenkinsTarget` on
the value before storing it.

So the write path is closed at three layers, not just hidden in the UI:

| Layer | What enforces it |
| ----- | ---------------- |
| UI | `environment-form.tsx` has no Jenkins field |
| Type | `EnvironmentInput` (`types/common/project.ts`) doesn't include `jenkinsUrl` |
| Service | `envInputToColumns` never maps `jenkins_url`, so `PATCH /environments/[envId]` can't set it either |

`saveEnvironmentJenkinsConfig` remains the sole writer (plus `linkJenkinsJob`,
which is the **Use**/link action feeding the same field through the same
SSRF-checked service). It also sets `cicd_provider = 'jenkins'` on save, so
configuring an environment can't leave the provider disagreeing with the config.

## Why the token is split out

A VM's Jenkins **server root and username** are not secret, so they live in
`vm_jenkins`, readable by every signed-in user. The **API token** is secret, so
it lives in `vm_jenkins_secrets`, a table with **RLS on and no policies**: no
authenticated client can read or write it. Only server code touches it, via the
service-role client, behind an editor check to change it and a `canRunBuild`
check to use it. It is never sent to a browser; the dialogs are told whether
one is stored. See [schema.md](./schema.md#vm_jenkins--vm_jenkins_secrets).

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
| Routing    | `app/api/projects/[id]/environments/[envId]/jenkins-config/route.ts` (GET/PUT), `.../jenkins-sync/route.ts` (GET preview, POST apply), `.../jenkins-jobs/route.ts` (GET), `.../jenkins-build/route.ts` (POST), `.../jenkins-link/route.ts` (POST), `.../jenkins-run/route.ts` (GET — build progress), `.../jenkins-runs/route.ts` (GET — build history, `?portId=` for one record) |
| UI         | `components/environments/jenkins-config-dialog.tsx` (modal), `jenkins-jobs-dialog.tsx` (browse), `jenkins-history-dialog.tsx` (per-record build history), `jenkins-sync-dialog.tsx` (sync preview + apply), `jenkins-status.tsx` (status + run pills), per-env buttons + record rows in `components/environments/environments-section.tsx` |
| Hook       | `hooks/environments/useEnvironmentJenkins.ts` (config, job list, trigger, run progress, history), `hooks/environments/useEnvironments.ts` (`previewJenkinsSync`, `syncFromJenkins`) |
| Service    | `services/jenkins/jenkinsService.ts`, `services/jenkins/extraction.ts`, `services/jenkins/portSyncPlan.ts` (what a sync would change; pure) |
| Repository | `repositories/jenkins/jenkinsRepository.ts` (external HTTP), `repositories/vmJenkins/vmJenkinsRepository.ts` + `vmJenkinsSecretRepository.ts` (the VM's server; the token through the service-role client), `repositories/environmentBuildRuns/environmentBuildRunRepository.ts` (build history) |
| Shared     | [`lib/jenkins-url.ts`](../lib/jenkins-url.ts) — deriving a server root, the same-server guard, and re-mounting reported URLs (see [below](#the-urls-jenkins-reports-are-not-the-address-you-reach-it-on)) |

`jenkinsRepository` is the **one external-HTTP data source** — the documented
exception to "repositories only touch Supabase" (architecture.md / AGENTS.md §2).

## The URLs Jenkins reports are not the address you reach it on

Every absolute URL in a Jenkins API response — `job.url`, the queue item in a
trigger's `Location` header, `executable.url` — is built from Jenkins' own global
**Jenkins URL** setting (Manage Jenkins → System → Jenkins Location), *not* from
the address the request arrived on. The two disagree as soon as that setting goes
stale: a VM that moved to a new IP, a server put behind a proxy, a renamed host.
A request to `http://20.197.41.68:8080` then comes back describing jobs at
`http://20.204.129.96:8080/job/…`.

Untreated, that host is what gets stored on a record (`jenkins_job_url`), what the
row's job link opens, and what ▶ Run posts back — where the SSRF guard correctly
refuses it (*"That job URL doesn't belong to this Jenkins server"*) even though the
user configured the right server. Symptom: a record whose link is dead and whose
Run button always errors, while Status and Last build still populate (those come
from the job *listing*, which is fetched from the configured base).

So `rebaseOnJenkinsServer` re-mounts every such URL on the base the environment is
configured with, keeping only its path (context paths honoured; a URL already on
that server is returned unchanged). It is applied at each boundary:

| Where | What it fixes |
| ----- | ------------- |
| `listJenkinsJobs` (`flattenJobs`) | the browse dialog's links, and the URL **Use** stores on a new record |
| `rowToPort` via `rowToEnvironment` | records **already stored** with the old host — the row link, the ▶ Run payload, and the job-list match behind Status / Last build |
| `triggerJenkinsBuild` | the job URL posted from a row, and the queue URL returned to the poller |
| `getJenkinsRunState` | the queue/build handles the client polls, and `executable.url` |
| `listEnvironmentBuildRuns` | job and build links on runs recorded before the server moved |
| `linkJenkinsJob` | never writes Jenkins' self-reported host back onto the environment |

Because a re-mounted URL always carries the environment's own origin, this
**strengthens** the SSRF guard rather than loosening it: the token can only ever be
sent to the server the environment points at, and `isSameJenkinsServer` stays as
the assertion behind it. Correcting stored URLs on read (not by migration) also
means a server that moves *again* needs nothing but the new URL in Jenkins
settings.

## Flow

On a project page, each environment whose CI/CD provider is **Jenkins** shows
(editor+ unless noted):

1. **Jenkins settings** (⚙) — opens a modal to set the environment's **Job
   URL**. It shows the VM's server and user, or says what the VM is missing and
   links to it; the credentials are set on the VM, not here. See
   [Inheriting a VM's Jenkins credentials](#inheriting-a-vms-jenkins-credentials).
2. **Browse jobs** (list icon) — lists **all jobs on the server**. Needs only a
   server, not a job, so it is also shown when the environment has no job yet but
   its VM has a server — that is how an environment picks its *first* job. For each job it shows status (from `color` + last build result), last build
   #/time, and description, with:
   - **Run** — triggers a build (POST `{jobUrl}/build` with a CSRF crumb),
     behind a confirm. Needs `Job → Build` permission.
   - **Use** — adds the job as a **record in the environment's ports table**
     (`source='jenkins'`, description from the job, job URL stored on the row,
     port left blank). The dialog stays open so several jobs can be added.
3. **Sync from Jenkins** (⟳) — reads the job's `config.xml` and shows a
   **preview** of what syncing would change before anything is written (#33):

   | Section | Meaning | On apply |
   | --- | --- | --- |
   | To remove | `jenkins`-sourced records the config no longer yields | deleted |
   | To add | ports found in the config with no record yet | inserted |
   | Unchanged | `jenkins`-sourced records the config still yields | left alone |
   | Not touched | records added by hand or imported from `docker ps` | never touched |
   | Couldn't be mapped | port-like items extraction saw and rejected (#28) | — |

   Records are matched on port + protocol, so a protocol change is a removal
   plus an addition. **Apply** writes only the difference, which makes a second
   apply with the same job config a no-op. The preview carries a `fingerprint`
   of its plan; apply recomputes the plan server-side, never trusting one sent
   by the browser, and refuses with **409** if the fingerprint no longer
   matches, meaning the job changed since the preview. Shown only once the
   environment has a job URL of its own: it parses *that* job, and there is no
   sibling's job it could sensibly fall back to.
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

## Inheriting a VM's Jenkins credentials

A VM runs **one** Jenkins, so every environment on it uses the VM's server,
user and token. Nothing is copied: the environment stores only its job, and
each Jenkins call reads the VM's configuration at that moment. Rotating the
VM's token in the tracker takes effect for all of its environments at once.

Resolution is split in two, and which one a call uses is a real decision:

| Resolver | Needs | Used by |
| -------- | ----- | ------- |
| `resolveEnvJenkinsServer` | the VM's server root, user and token | **Browse jobs**, **link a job** |
| `resolveEnvJenkins` | all of the above **plus this environment's own job URL** | **Sync ports**, **trigger a build**, job status |

The server is the VM's, the job is the environment's. Listing what jobs exist
needs only a server, so requiring a job URL first would make the affordance that
*sets* the job URL unreachable. Anything that reads or runs *this* environment's
pipeline still requires its own job: there is no other environment's job it
could sensibly fall back to.

`jenkinsInherited` on the environment payload is what lets the card show the
browse-jobs action before a job is set. `annotateJenkinsInheritance`
(`services/jenkins/inheritance.ts`) sets it on every Jenkins environment whose VM
has a **complete** server (root, user and token), with two queries for the whole
project. Only a complete server counts, or the card would offer a browse that
then fails. It is advisory: the service reads the VM and re-checks access
itself, so a forged `true` buys nothing. The module exists separately from
`jenkinsService` because `projectService` needs it and `jenkinsService` already
imports `projectService`; putting it there would close an import cycle.

A VM can host more than one project's environments, so they share one set of
credentials. That is deliberate: the VM is the unit that has a Jenkins.

## Records by provider

The records table isn't one fixed shape — a record means something different per
provider, so the columns follow the provider:

| Provider              | Columns                                              | Docker import |
| --------------------- | ---------------------------------------------------- | ------------- |
| `jenkins`             | Port · Name · *Link* · Domain · Status · Last build  | yes           |
| `other` / `none`      | Port · Name · *Link* · Domain                        | yes           |
| `aws` / `azure` / `amplify` | Name · **Default domain** · Custom domain    | no            |

*Link* is conditional on top of the provider — see
[The Link column](#the-link-column) below.

**No Port on a managed platform.** It doesn't deploy a port on a host — an
Amplify deployment is a *branch*, AWS/Azure ones are services behind their own
endpoints — and `docker ps`, which is nothing but host-port mappings, has nothing
to import into it. The branch that gets deployed used to be the leading column
there; it now lives with the repository in every row's source popover, picked
from GitHub ([github.md](./github.md)), so all providers show it the same way. `other`/`none` keep ports:
those are the hand-tracked, VM-hosted records the docker import was built for.

**Default domain takes Link's place on a managed platform.** Every AWS / Azure /
Amplify deployment gets a hostname from the platform before any DNS points at it
(`matrimony-fe-….azurewebsites.net`, `main.d1abc.amplifyapp.com`) — the address
that works first, which is exactly what `ip:port` is for a VM record. It's stored
in `endpoints.default_domain` and shown, with an open-link button, as its own
column; the **Domain** column beside it is then labelled **Custom domain**. Both
are one `DomainCell`, linked through `domainUrl`. A managed record with only a
default domain still counts as reachable: `recordUrl` falls back to it when the
custom domain is blank.

The set lives in one place — `PORTLESS_PROVIDERS`, with `providerHasPorts` /
`providerHasBranch` / `providerHasDefaultDomain`, in [`types/common/project.ts`](../types/common/project.ts)
beside `CICD_PROVIDERS` — so no component re-lists provider names (AGENTS.md
§types). Both the record rows and the Add row follow it, including what makes
**Add** clickable: the port where there are ports, and a name or either domain
where there aren't (the source is set afterwards, from the popover).

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

### The Link column

A record's **Link** is its direct address on the VM the environment runs on —
`http://10.0.0.5:3000`, opened or copied straight from the row. It sits **before
Domain** because it is the address that works first: the port is live on the VM
the moment the record exists, while the domain still has to be pointed at it.

It needs both halves, so the card shows the column only when
`providerHasPorts(provider) && env.vmIp` — a port-bearing provider, and a linked
VM that has an address. Without a VM the column could only ever be a wall of
dashes, and the missing half is the *environment's*, not the record's; the VM chip
in the card header (which shows `name · ip`) is where that gap reads. Inside the
column, a record with no port yet reads **"Add a port"** rather than a dash.

The two halves resolve like this, both in
[`lib/endpoints.ts`](../lib/endpoints.ts):

- `vmLiveIp(vm)` — the address the VM answers on **today**: the new IP once
  `migrated` is set, the old one until then. A row in mid-migration carries both,
  and the tracker's new IP isn't serving anything yet. It is resolved in
  `rowToEnvironment` and carried on the environment as `vmIp`, so the records
  table, the Add row's preview, and the docs generator can't derive it three ways.
- `recordLiveUrl(record, vmIp)` — `scheme://ip:port`, or null when either half is
  missing or the record isn't a web protocol. The scheme is always plain
  `http`/`ws`: TLS is terminated per *hostname* by whatever proxy fronts the
  domain, so `https://` on a bare IP is only ever a certificate error. This is why
  the visible label is the bare `ip:port` — the scheme carries no information.

`recordUrl` (the public, DNS-fronted address) is unchanged and still the one the
dashboard's "reachable" count uses. The generated docs now carry both, labelled
apart.

The Domain column's own link is `domainUrl(domain)` — `https://host` (or `http://`
when the stored value explicitly says so), **without** the record's port: a domain
is fronted by its proxy/platform on the default port. Like `recordLiveUrl` it
picks the scheme itself, so the stored string never lands in the scheme position.
Editors get an open-link button beside the input (built from the *saved* value);
viewers get the domain as a link.

## Repository and branch

Every record row has a **source** icon (a branch glyph beside its name) that opens
a popover with the repository and branch it's built from. One display, two ways
of filling it in:

- **A record linking a Jenkins job** reads both live, when the popover opens,
  from that record's own job `config.xml` —
  `GET …/environments/:envId/ports/:portId/jenkins-source` →
  `getJenkinsRecordSource` → `extractScm`
  ([services/jenkins/extraction.ts](../services/jenkins/extraction.ts)). Nothing
  is stored, so nothing drifts when the job is edited. Open to every signed-in
  role, like the Status column; cached client-side for five minutes.
- **Every other record** (manual, docker, any managed platform) has them chosen
  in the popover by an editor and stored on the row (`endpoints.repo_url`,
  `endpoints.branch`) — from searchable GitHub dropdowns when the app has a
  GitHub token, typed when it doesn't. See [github.md](./github.md).

`extractScm` tries, first hit per field: the Git SCM block
(`<userRemoteConfigs>…<url>` + `<hudson.plugins.git.BranchSpec>` — freestyle,
"Pipeline script from SCM", and multibranch child jobs), the multibranch
`BranchJobProperty`, branch sources (`<remote>`, or GitHub's `<repoOwner>` +
`<repository>`), then an inline pipeline's `git url:/branch:` or
`checkout([... branches: [[name: ...]]])`. `*/main`, `origin/main` and
`refs/heads/main` all normalise to `main`; a branch given as `${PARAM}` resolves
to that parameter's default value and the popover says so. It reads the job the
record links, resolved at **server** level and guarded like a build trigger
(re-mounted on the environment's server, refused if it isn't on it).

**Credentials:** a job that clones `https://user:token@github.com/…` would hand
that token to every viewer. `stripRepoCredentials`
([lib/repo.ts](../lib/repo.ts)) drops the userinfo before the value leaves the
server, and before a hand-entered URL is stored. The link itself is built by
`repoWebUrl` — always `https://` + a validated host, accepting HTTPS, `ssh://`,
SCP-style `git@host:org/repo` and bare `org/repo` (taken as GitHub).

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

**It also reports what it couldn't map** (#28). `extractPorts` returns
`{ ports, skipped }`. A skipped item is one of two kinds
(`PORT_SKIP_REASONS`):

| Reason | Example | Meaning |
| --- | --- | --- |
| `out_of_range` | `-p 8080:123456`, `EXPOSE 0` | A pattern matched it, but it isn't a port (1–65535) |
| `no_pattern` | `curl http://localhost:4000`, `listen 8081`, `"3000:3000"` | It looks like a port, but no pattern turned it into one |

Each item carries the number, the pattern or hint that saw it, and about a
line of the config around it. A `no_pattern` hint whose number a pattern
already mapped isn't reported. The sync preview lists them in a collapsible
"N items couldn't be mapped" section, open by default when nothing was mapped.
The summary line distinguishes "nothing found" from "found port-like items,
mapped none", which a bare count couldn't.

`docker -p single` doesn't match the host half of a mapping: `-p 8080:3000`
yields 3000 only. (It used to yield 8080 too.)

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
- ~~**Credentials are per environment, and cannot be shared.**~~ **Resolved**
  by `vm_jenkins` / `vm_jenkins_secrets` (#80): the server, its user and its
  token belong to the machine, so ten environments on one Jenkins are configured
  once and a token is rotated in one place. The per-environment copy is removed
  by **#84**, in three steps that **must be deployed in this order**:
  1. apply `…_backfill_vm_jenkins_from_environments.sql`, which gives every VM
     that still depended on an environment's credentials a server of its own;
  2. deploy the app version that reads only the VM;
  3. apply `…_drop_environment_jenkins_credentials.sql`. It refuses to run while
     any Jenkins environment's VM lacks a server, user or token.

  Deploying step 2 before step 1 leaves the environments that depended on their
  own credentials without Jenkins until step 1 runs. Running step 3 before step 2
  breaks the Jenkins dialog of the version still deployed, which reads
  `environment_secrets`. `deriveJenkinsBase()` stays: it turns a job URL into its
  server root, which the record mapper and the job links still need.
- **A wrong Jenkins URL setting is worked around, not repaired.** Re-mounting keeps
  this app working, but Jenkins itself still emails links and renders absolute URLs
  pointing at the stale host. Fixing Jenkins Location on the server is still worth
  doing.
