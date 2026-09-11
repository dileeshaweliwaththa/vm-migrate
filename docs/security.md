# Security

What this app protects, where it is enforced, what was reviewed, and which risks
are **accepted on purpose**. Read [auth.md](./auth.md) first for the mechanics of
sign-in and the three enforcement layers — this document does not repeat them; it
records the *posture* and the reasoning behind it.

Last full review: **2026-08-07**, against the whole app (every route handler, every
RLS policy, both parsers, and all outbound HTTP).

## Threat model

An internal deployment tool for one team. It holds no customer data. What it does
hold is a map of infrastructure — hosts, ports, domains, Jenkins servers — plus
credentials that can *trigger deployments*. So the assets, in order of value:

| Asset | Where | Who may reach it |
| ----- | ----- | ---------------- |
| Jenkins API tokens | `environment_secrets`, `vm_jenkins_secrets` | **nobody** via any client; server code only |
| Backup DB passwords + Azure connection strings | `backup_target_secrets` | **nobody** via any client; server code only |
| Scheduled-backup bearer token | `BACKUP_CRON_SECRET` (env) + Supabase Vault | server code only; pg_cron reads its copy from Vault |
| Gemini API key | `app_settings.gemini_api_key` | admins (write-only), server code (read) |
| Supabase service-role key | server env var | server process only |
| Ability to trigger a deploy | Jenkins, via the app | every signed-in role |
| Infrastructure inventory | `vms`, `vm_groups`, `vm_jenkins`, `backup_targets`, `projects`, `environments`, `endpoints` | every signed-in user (read) |

The adversaries worth designing against, in order:

1. **An unauthenticated internet user.** Everything except `/login` and the two
   auth endpoints is behind a validated session.
2. **A signed-in viewer.** Should be able to read, and to run a build (deliberate,
   see below) — nothing else.
3. **A signed-in editor.** Trusted with configuration, *including* Jenkins
   credentials and therefore deployment authority. Not trusted with user
   management, settings, or irreversible tracker actions.
4. **A compromised browser session.** Assume XSS = full session takeover, because
   the session cookie is readable by JavaScript (see [A2](#a2)).

There is **no per-project isolation**. Every authenticated user reads every
project, environment, record, and VM (`select … using (true)`). That is a
deliberate product decision for a single-team tool, not an oversight — but it
means "viewer" is a read-everything role, including every domain, port, Jenkins
URL, and who deployed what.

## Enforcement summary

Three independent layers, each of which must hold alone — page guard, route
handler, role + RLS. Details and the file map are in
[auth.md § Where access is enforced](./auth.md#where-access-is-enforced).

Verified in this review:

- **Every** route handler under `app/api/` re-checks the session and answers 401
  itself. The only two without a guard are `auth/signup` and `auth/verify`, which
  must be public.
- Role checks live in services, never in handlers. Admin-only pages
  (`/admin/users`, `/admin/settings`) additionally redirect non-admins, and
  `listProjects` refuses `?archived=true` for non-admins server-side — a
  hand-crafted query string reveals nothing.
- RLS is enabled on every table, with writes gated on
  `public.current_user_role()`. `profiles` has **no self-update policy**, so a
  viewer cannot promote themselves — role changes are admin-only, in Postgres, not
  just in the app.
- `environment_secrets`, `vm_jenkins_secrets` and `backup_target_secrets` have RLS
  on with **no policies at all**: unreachable by any
  authenticated client, by construction rather than by policy logic.

### Service-role paths are the load-bearing ones

Three repositories use the service-role client and therefore **bypass RLS**. For
these the service-layer check is the *only* enforcement:

| Repository | Gate that must hold |
| ---------- | ------------------- |
| `userRepository` (all of it) | `requireAdmin()` in `userService` |
| `appSettingsRepository.findAppSettingsServiceRole` | reached only from `getGeminiConfig`, whose callers are `canEdit`-gated |
| `environmentSecretRepository` | `canEdit` to configure, `canRunBuild` to use, in `jenkinsService` |

Adding a function to any of those three without a preceding role check silently
removes RLS from that data. `createServiceClient` is imported by exactly those
three files today — that grep is the audit.

## Secrets handling

- The Jenkins token is **write-only** from the browser's perspective: the config
  dialog can set it, and `getEnvironmentJenkinsConfig` returns `hasToken: boolean`
  instead of the value. A viewer can run a build without the token ever reaching
  their browser.
- **One token can be copied to another environment on the same VM**, entirely
  server-side ([jenkins-sync.md § Inheriting a VM's Jenkins
  credentials](./jenkins-sync.md#inheriting-a-vms-jenkins-credentials)). This is
  the only path that moves a token between rows, and it holds the write-only rule:
  `saveEnvironmentJenkinsConfig` reads the donor's value and writes the new row
  through the service-role repository, so the token is never returned to a client,
  and the modal's "pre-fill" is only ever the server root and username. The
  supporting query, `findEnvironmentIdsWithToken`, returns **ids only** — by
  construction it cannot carry a token value out to a caller. Gated on `canEdit`
  like every other write in that service. Two properties to preserve if this is
  extended: the donor must be on the *same VM* (`vm_id`, the unit that actually
  has a Jenkins), and an explicitly typed token must always win over the copy.
  Note the blast radius it accepts: a VM can host environments from **different
  projects**, so an editor configuring one project's environment may inherit a
  token first configured in another. That grants no capability an editor lacked —
  they could already trigger builds against that server through the donor
  environment, and per [A7](#accepted-risks) deployment authority is effectively
  "editor" — but it does widen where the value is *stored*, which is why the modal
  names the VM it is borrowing from rather than filling the fields silently.
- **A token is also *used* across rows, not only copied.** `resolveEnvJenkinsServer`
  falls back to the same VM's donor for the server root, username, and token when an
  environment has none of its own, so an unconfigured environment can list the jobs
  on its VM's Jenkins ([jenkins-sync.md § Inheritance at read
  time](./jenkins-sync.md#inheritance-at-read-time-not-just-on-save)). This does not
  widen where the token is *stored* — nothing is written — and it holds the
  write-only rule: the value is read through the service-role repository and used to
  sign an outbound request, never returned to a client. It is the same blast radius
  already accepted for the copy above, reached one step earlier: an editor could
  trigger builds against that server through the donor environment anyway.
  Three properties to preserve:
  - the donor must be on the **same VM**, as with the copy;
  - the **SSRF guard applies to the inherited base too** — `isDeniedJenkinsTarget`
    is re-checked on whatever address is about to be fetched, so a denied target
    cannot become reachable by way of a sibling row;
  - only the **server** is inheritable, never the job. `resolveEnvJenkins` — the
    resolver behind port sync and build triggering — still requires the
    environment's own `jenkins_url`, so an inherited server can never cause a sync
    or a deploy to hit a sibling's pipeline.

  `jenkinsInherited` on the environment payload is a UI affordance only; the
  resolver re-derives the donor server-side, so a forged value grants nothing.
- The Gemini key is likewise reduced to `hasGeminiKey`. Provider errors are
  translated by `interpretGeminiError` rather than passed through raw.
- `SUPABASE_SERVICE_ROLE_KEY` is read inside `createServiceClient()` at request
  time, so it never lands in the client bundle and is not a Docker build arg
  (unlike `NEXT_PUBLIC_*`, which are inlined at build time — see
  [deployment.md](./deployment.md)). The runtime image runs as a non-root user.
- `.env*` is gitignored; the committed `env.*.sample` files contain placeholders
  only. Verified: no secret material is tracked in git.

## SSRF

Two integrations *fetch* a URL that came from a user, and together they are the
whole SSRF surface. (The backup runner also reaches outward — a MySQL host and an
Azure storage account an editor typed in — but it opens a database connection and
an SDK client rather than fetching a URL, so there is no redirect to follow and no
response body to reflect. What an editor can do there is dump a database they can
already reach into a container they control; see
[backups.md](./backups.md#security).) **Jenkins** (an environment's server,
now the VM's — see [jenkins-sync.md](./jenkins-sync.md)) and the **backup
services** (a registry row's `base_url` — see [backups.md](./backups.md)). They
share one host denylist, `isDeniedOutboundTarget` in
[lib/outbound-url.ts](../lib/outbound-url.ts): a denylist that exists twice is one
that gets updated once.

The Jenkins side has two distinct problems, and only one of them is closed.

**Closed: the token cannot leave the configured server.** Every URL reaching
`jenkinsRepository` is first re-mounted on the environment's own server root by
`rebaseOnJenkinsServer` and then asserted with `isSameJenkinsServer`
([jenkins-sync.md](./jenkins-sync.md#the-urls-jenkins-reports-are-not-the-address-you-reach-it-on)).
Re-mounting makes this structural rather than a check that could be bypassed: the
result *always* carries the configured origin, so a job/queue/build URL naming
another host becomes a path on the right host instead of a request to the wrong
one. Confirmed for a sibling-domain attempt
(`https://jenkins.corp.attacker.test/job/x/` with base `https://jenkins.corp`
re-mounts to `https://jenkins.corp/job/x/`), userinfo URLs, and relative
`Location` headers.

Also verified empirically, since three of the four fetches follow redirects:
**Node's `fetch` strips the `Authorization` header on a cross-origin redirect**, so
a Jenkins server that 302s elsewhere cannot walk away with the Basic-auth
credentials.

**Accepted: an editor decides what the server connects to.** The base URL is typed
into Jenkins settings, so an editor can point an environment at any host the
container can reach and then press *Browse jobs* or *Sync from Jenkins*. What comes
back to them is not the response body, but it is not nothing: distinct messages for
401 / 403 / 404 / other HTTP / network error make host-and-port probing possible,
and `extractPorts` returns port-like numbers found in whatever document was
fetched. See [A1](#a1) for why this is accepted rather than fixed.

One target class *is* refused outright, at save time and on every use
(`isDeniedOutboundTarget`, wrapped as `isDeniedJenkinsTarget` in
[lib/jenkins-url.ts](../lib/jenkins-url.ts)):
link-local addresses (`169.254.0.0/16`, `fe80::/10`), `metadata.google.internal`,
and the unspecified address. Those carry the cloud instance-metadata endpoints and
never answer a Jenkins server, so refusing them costs nothing. Private ranges are
**deliberately allowed** — reaching internal build servers is the point of the
feature.

## Stored HTML and XSS

`project_docs.content_html` is rendered with `dangerouslySetInnerHTML` in
[components/docs/doc-view.tsx](../components/docs/doc-view.tsx). It is safe for two
reasons that both have to keep holding:

1. **The HTML is never trusted from the client.** `saveProjectDoc` re-derives it
   from the canonical Tiptap JSON via `generateHTML(json, tiptapExtensions)`, so a
   crafted `contentHtml` in the request body is discarded. AI-generated HTML goes
   the other way through the same schema (`generateJSON`), which drops anything the
   schema has no node for — `<script>`, `<iframe>`, event-handler attributes.
2. **The one URL-bearing mark sanitizes itself.** `StarterKit` includes the Link
   mark, so a `javascript:` href *could* survive in the JSON; Tiptap's
   `renderHTML` runs `isAllowedUri` and emits `href=""` when it fails (verified in
   `@tiptap/extension-link` 3.29.1).

This becomes exploitable if someone adds an extension with URL or raw-HTML
attributes (image, iframe, HTML-passthrough), customizes Link's `protocols` /
`isAllowedUri`, or starts persisting client-supplied HTML. Treat any change to
[lib/tiptap/extensions.ts](../lib/tiptap/extensions.ts) as a security change.

Elsewhere, user-controlled strings reach `href` (`env.deployUrl`,
`env.jenkinsUrl`). React 19 neutralizes `javascript:` URLs in `href`/`src` by
replacing them with a throwing URL (verified in the installed `react-dom`), and
browsers block top-level `data:` navigation, so these are not injection sinks —
but they are only safe because the framework says so, which is worth knowing if the
rendering ever moves outside React.

The records table's **Link** column ([jenkins-sync.md § The Link
column](./jenkins-sync.md#the-link-column)) is the one `href` that does **not**
depend on that guarantee. `recordLiveUrl` never passes a stored string through: it
picks the scheme from a fixed `Protocol`-keyed table and interpolates the VM's IP
and the record's port *after* it, so a `javascript:` typed into either field can
only ever land in the host position of an `http://` URL. Keep it that way — a
future version that returns a stored value verbatim when it "already looks like a
URL" would put this back under A2.

## Browser hardening

Set for every response in [next.config.ts](../next.config.ts), and verified on a
live production response:

| Header | Value | Why |
| ------ | ----- | --- |
| `Content-Security-Policy` | `frame-ancestors 'none'` | clickjacking — admins have irreversible one-click actions (purge, clear trash, replace-all import) |
| `X-Frame-Options` | `DENY` | same, for readers of the older header |
| `X-Content-Type-Options` | `nosniff` | MIME confusion on API responses |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | internal hostnames and project ids stay out of `Referer` on outbound clicks |
| `Cross-Origin-Opener-Policy` | `same-origin` | severs `window.opener` for the `target="_blank"` links to Jenkins |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | nothing here needs them |

Deliberately **not** a full CSP: a real `script-src` needs a per-request nonce
threaded through the app, and a half-configured CSP that breaks the app is worse
than none. That is the main outstanding browser-side hardening ([A3](#a3)).

CSRF: the session cookie is `SameSite=Lax` (the `@supabase/ssr` default), so a
cross-site form POST does not carry it, and every mutating route is a
JSON-bodied POST/PUT/PATCH/DELETE. There are no CSRF tokens; Lax plus the JSON
content type is the entire defence. Note that Lax **does** send cookies on
cross-site top-level GET navigations, so no state-changing route may ever be a GET.

## Findings from the 2026-08-07 review

Fixed in this pass:

| # | Severity | Finding | Fix |
| - | -------- | ------- | --- |
| F1 | Medium | An editor-set Jenkins URL could point at a cloud instance-metadata endpoint (`169.254.169.254`), which the server would then fetch | `isDeniedJenkinsTarget`, enforced when the URL is saved and again on every use |
| F2 | Medium | Loss of administrative control: demoting the only admin was allowed, and only an admin can grant the role — an unrecoverable lockout | `changeUserRole` refuses when the target is the last admin |
| F3 | Low | Three user-management writes answered `400` for an authorization denial, so a 403 audit of the API would have missed them | shared `writeStatus` / `isDeniedMessage` in `lib/errors.ts` |
| F4 | Low | The `docker ps` paste was parsed with no size limit, and route handlers have no body cap of their own | 200k-character limit, rejected with a message rather than truncated |
| F5 | Low | No response security headers at all | the six headers above |

Fixed just before this review, and load-bearing for the SSRF story: URLs reported
by Jenkins are re-mounted on the configured server root, which is what makes
"the token cannot leave this server" structural. See
[jenkins-sync.md](./jenkins-sync.md#the-urls-jenkins-reports-are-not-the-address-you-reach-it-on).

Checked and found sound (no change needed): the 401 preamble on every route; RLS
on every table; no self-service role escalation; archived-project gating; the
write-only handling of both secrets; absence of committed secrets; the non-root
container; `generateHTML`/`generateJSON` as the only path into stored HTML.

## Accepted risks

Each of these is a real weakness, understood and left in place. Revisit them if the
tool's audience widens beyond one internal team.

<a id="a1"></a>
**A1 — An editor can use the server as a limited network probe.** Consequence of
the Jenkins feature existing: the app must connect to whatever internal address
the team's build server has. Compensating controls: editor+ only; no response body
is reflected verbatim; a 15s timeout on every request; credentials are never sent
off-origin (verified); link-local/metadata targets refused. A stricter version
would be an explicit allowlist of Jenkins hosts, which is the natural companion to
the `jenkins_servers` table proposed in
[jenkins-sync.md § Limitations](./jenkins-sync.md#limitations) (#80).

<a id="a2"></a>
**A2 — The session cookie is not `httpOnly`.** `@supabase/ssr` sets
`httpOnly: false` by default because the browser client reads the session from
`document.cookie`; it is not something this app opts into, and it cannot be
switched off without abandoning that client. So any XSS is a session takeover, not
just a defacement — which is why the stored-HTML path above is held to a strict
standard. The cookie is `SameSite=Lax`, `Secure` under HTTPS, with a 400-day
`maxAge` on the refresh material.

<a id="a3"></a>
**A3 — No `script-src` CSP.** Needs nonce plumbing through the app shell. Highest-
value remaining hardening, given A2.

**A4 — No app-level rate limiting.** `/api/auth/signup` (send a code) and
`/api/auth/verify` (redeem one) are unauthenticated and rely entirely on Supabase
Auth's own rate limits. The app adds nothing of its own — no per-IP throttle, no
attempt counter, no lockout. Confirm the OTP send/verify limits are set to
something deliberate in the Supabase dashboard rather than left at defaults, since
a 6-digit code is the entire authentication factor. Sign-in *is* enumeration-safe:
the response is identical for registered and unregistered addresses.

**A5 — Everyone reads everything.** See [Threat model](#threat-model). One
deliberate exception: downloading a database dump
([backups.md](./backups.md#downloading-goes-through-the-portal)) is editor+,
because it hands over the contents of every table rather than metadata about
them.

**A6 — Unexpected failures return their message verbatim.** A 500 from a route can
carry Postgres or provider text, which leaks schema and internal detail to an
authenticated user. Bounded by the fact that all readers are already trusted with
the data; worth normalizing if the audience widens.

<a id="a8"></a>
**A8 — ~~A backup worker's own API is unauthenticated~~ — resolved.** The
external worker is gone: the app performs its own dumps
([backups.md](./backups.md)), so there is no second service with an open API in
the path. Its replacement, `POST /api/backups/cron`, is the app's only
token-authenticated route — constant-time comparison, refused entirely when
`BACKUP_CRON_SECRET` is unset, and able to do exactly one thing: start a backup.
The original finding, for the record:

**A backup worker's own API is unauthenticated.** `upview-db-backup-tracker`
gates its web UI with a login but not its API: every `/api/*` route is open and
`cors()` is on. So anyone who can reach a backup host can already list, trigger
and **delete** dumps without this app. What the portal adds is a button in front of it,
behind our own RBAC (run = editor; schedule, dump deletion and target removal =
admin, see [backups.md](./backups.md#permissions)). Fixing it belongs in the
worker: a token on the mutating routes, stored in `backup_target_secrets`
alongside the credentials that are already there
([#90](https://github.com/kodplex/upview-vm-tracker/issues/90)). Until then, the
control that matters is network reach to port 2999.

**A7 — Deployment authority is effectively "editor".** An editor can change any
environment's Jenkins credentials and job, and any signed-in user can trigger a
build. That is the documented design ([jenkins-sync.md](./jenkins-sync.md)), with
attribution in `environment_build_runs` standing in for a stricter gate.

**A8 — Build runs are the only audit trail.** Role changes, user deletions, VM
purges, trash clears, and replace-all imports leave no record of who did them.
`environment_build_runs` proves the pattern; the destructive actions are the ones
that would most benefit from it.

## Checklist for new code

1. New route handler → copy the `getCurrentUser()` → 401 preamble. Put the role
   check in the service, and return 403 for a denial (`writeStatus`).
2. New table → `enable row level security` **and** policies in the same migration;
   writes gated on `public.current_user_role()`. A table with RLS and no policies
   is the right answer for anything only server code should touch.
3. Reaching for `createServiceClient()` → you are removing RLS. There must be a
   role check above it, and it belongs in one of the three documented repositories.
4. New outbound `fetch` to a user-supplied URL → re-mount it on a trusted base
   before the request, do not merely validate it, and never attach credentials to a
   URL you did not construct.
5. New Tiptap extension, or any new `dangerouslySetInnerHTML` → see
   [Stored HTML and XSS](#stored-html-and-xss). Assume the JSON is attacker-controlled.
6. New secret → it does not go on a table that authenticated clients can read.
   Return a `has…: boolean`, never the value.
