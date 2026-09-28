# GitHub connection

One GitHub access token for the whole app, set by an admin in **Settings →
GitHub**. It exists for one thing: letting editors **pick** a record's repository
and branch from dropdowns instead of typing them.

## Where it's used

Every record row has a **source** icon beside its name (see
[jenkins-sync.md § Repository and branch](./jenkins-sync.md#repository-and-branch)).
For a record that links a Jenkins job, the source is read from the job and GitHub
isn't involved. For **every other record** — manual, docker, and all of
AWS/Azure/Amplify — the popover offers:

- **Repository** — a searchable list of every repository the token can see
  (archived ones left out, private ones marked with a lock). Picking one stores its
  web URL in `endpoints.repo_url` and pre-selects its **default branch**.
- **Branch** — a searchable list of that repository's branches, stored in
  `endpoints.branch`.

No token, a token GitHub rejects, or a non-GitHub repository all fall back to
typing, so nothing depends on the connection. **Type instead** also switches to
free text for a repository the token isn't granted.

This replaced the **Branch** column that managed-platform environments used to
lead with: the branch now sits with its repository, the same way on every
provider. A managed-platform row is now **Name · Default domain · Custom
domain** — added with any of the three, with its source set from the popover
afterwards.

## The token

A **fine-grained personal access token**:

| Setting | Value |
| ------- | ----- |
| Resource owner | the **organisation** that owns the repositories (not your personal account, or its private repositories won't be listed) |
| Repository access | *All repositories*, or the ones records should be pickable from |
| Permissions | **Metadata: read-only** — enough to list repositories and branches. Nothing else. |
| Expiration | set one; **Test** in Settings shows when it last verified |

An organisation may require fine-grained tokens to be **approved** before they
work; until then the token authenticates but sees no repositories, and **Test**
reports `0 repositories visible`. A classic token with `repo` scope also works,
but grants far more than this needs.

## Layers

| Layer      | File |
| ---------- | ---- |
| Routing    | `app/api/settings/github/route.ts` (GET status, PUT token), `app/api/settings/github/test/route.ts`, `app/api/github/repos/route.ts`, `app/api/github/branches/route.ts` |
| UI         | `components/settings/github-settings.tsx`, `components/environments/record-source.tsx` |
| Hook       | `hooks/github/useGithub.ts` |
| Service    | `services/github/githubService.ts` |
| Repository | `repositories/github/githubRepository.ts` (HTTP to api.github.com), `repositories/githubSecrets/githubSecretRepository.ts` (service-role) |

## Access

| Action | Who | Gate |
| ------ | --- | ---- |
| See whether GitHub is connected, and as whom | admin | `isAdmin` in `getGithubStatus` |
| Set, replace, test or disconnect the token | admin | `isAdmin` in `saveGithubToken` / `testGithubConnection` |
| List repositories and branches | editor+ | `canEdit` in `listGithubRepos` / `listGithubBranches` — only editors can set a record's source |

A viewer opening the popover sees the stored repository and branch as text and
never calls GitHub.

## Security

- **The token is write-only.** It lives in `github_secrets`, a singleton with RLS
  on and **no policies**, reached only through `githubSecretRepository` with the
  service-role client. The browser is told `configured` and the account login,
  never the value.
- **Verified before it's stored.** `saveGithubToken` calls `GET /user` first and
  refuses a token GitHub rejects, so "connected" always means "worked when saved".
- **It can only be sent to api.github.com.** `githubRepository` takes path
  *segments*, never a URL; the origin is a constant. Pagination follows GitHub's
  `Link` header only while it stays on that origin, and listings stop at ten pages
  (1,000 items). `owner` / `repo` are validated against GitHub's own name rules
  before a branch listing. There is no user-supplied address, so this adds nothing
  to the SSRF surface ([security.md § SSRF](./security.md#ssrf)).
- **Stored repository URLs are cleaned.** Whatever is saved on a record goes
  through `stripRepoCredentials`, and links are built by `repoWebUrl` (always
  `https://` + a validated host).
