# Secure deployment: keeping the codebase off the server

**Status:** Proposal for discussion, nothing implemented yet
**Date:** 2026-09-29
**Prepared by:** Dileesha Weliwaththa

---

## 1. The ask

> When we deploy, only the built output should run, not the complete cloned
> source. Inside Docker only the build output runs, but the codebase is still
> on the server. Find out how this is usually done and keep the codebase safe.
> With PHP you can't do that, which is why it's more vulnerable.

In short, the **container is clean but the server isn't**. Every deploy leaves
the full source code, the `.git` history and the `.env` secrets on the server.

This document describes the current flow, what is wrong with it, and the two
approaches we can implement now:

- **Approach 1**: clean up after the build (small change, same server)
- **Approach 3**: build on GitHub Actions, deploy with Jenkins (the target)

---

## 2. Current flow

```
┌─────────────────────────────────┐
│ 1. Push to GitHub               │  no webhook
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 2. Run the Jenkins job by hand  │  from the Jenkins UI
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 3. Jenkins clones the repo      │  into the workspace on the server
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 4. Copy .env in by hand         │  into the workspace folder
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ 5. docker compose up -d --build │  the image is built ON the server
└────────────────┬────────────────┘
                 ▼
┌─────────────────────────────────┐
│ ⚠ Server keeps everything       │  source, .git, .env, build cache
└─────────────────────────────────┘
```

### What stays on the server after every deploy

```
Jenkins workspace  (e.g. /var/lib/jenkins/workspace/<job>/)
├── .git/                    ❌ full history, including any secret ever committed
├── .env                     ❌ every secret, plain text, copied by hand
├── app/ services/ lib/ …    ❌ the full source code
└── Dockerfile, docker-compose.yml

Docker build cache           ❌ the "builder" stage layers hold the full source
                                again (COPY . .), even if the workspace is deleted

Running container            ✅ only the built output (.next/standalone)
```

### What is already right

- The **Dockerfile is multi-stage**. The final image has only the built output,
  with no source, no dev dependencies and no npm.
- **`.dockerignore`** keeps `.env`, `.git` and docs out of the image.
- The **service-role key is runtime-only** and never baked into the image.

### What is wrong

| # | Problem | Why it matters |
|---|---|---|
| 1 | Source stays on the server after the deploy | Anyone who gets in (leaked SSH key, a Jenkins bug, a container escape) can read the whole codebase |
| 2 | `.git` stays | They also get the full history, including secrets that were committed once and "deleted" later |
| 3 | `.env` is copied by hand into the workspace | Secrets sit in plain text next to the source. There is no record of changes, and the manual step is easy to get wrong |
| 4 | **The image is built on the production server** | This is the root cause. Production needs git, build tools and the source, and it keeps them. Docker's build cache keeps a copy of the source too |
| 5 | No image registry | The image exists only on that server, so there is no quick rollback to the previous version |
| 6 | Manual trigger | Not a security problem, just slower (optional to fix) |

---

## 3. Why PHP is different

```
Next.js / Node:  source ──(npm run build)──▶ build output ──▶ runs
                                                   source NOT needed at runtime

PHP:             source ─────────────────────────────────▶ runs
                                                   the source IS what runs
```

PHP has no build step. The `.php` files have to be on the server, so we can't
remove them. We can only reduce how exposed they are (see [section 8](#8-php-projects)).

---

## 4. The industry-standard rule

> **Build somewhere else. Ship only the finished result (the Docker image).
> Give secrets to the app when it runs. The production server holds only what
> is running.**

---

## 5. Approach 1: Clean up after the build (same server)

**The idea:** keep today's flow, but leave nothing behind. There is no new
server, no new tool and no new cost.

### Flow

```
┌───────────────────────────────────┐
│ 1. Push to GitHub                 │  same as today
└─────────────────┬─────────────────┘
                  ▼
┌───────────────────────────────────┐
│ 2. Run the Jenkins job            │  same as today
└─────────────────┬─────────────────┘
                  ▼
┌───────────────────────────────────┐
│ 3. Shallow clone (depth 1)        │  CHANGED: latest commit only,
│                                   │  no history
└─────────────────┬─────────────────┘
                  ▼
┌───────────────────────────────────┐
│ 4. Jenkins supplies the .env      │  CHANGED: stored in Jenkins
│    as a "Secret file"             │  Credentials, never written
│                                   │  into the workspace
└─────────────────┬─────────────────┘
                  ▼
┌───────────────────────────────────┐
│ 5. docker compose up -d --build   │  same as today
└─────────────────┬─────────────────┘
                  ▼
┌───────────────────────────────────┐
│ 6. Clean up                       │  NEW: delete the build cache,
│                                   │  old images and the workspace
└─────────────────┬─────────────────┘
                  ▼
┌───────────────────────────────────┐
│ ✓ Server keeps: the running       │
│   container + its image only      │
└───────────────────────────────────┘
```

### What changes

| Change | How |
|---|---|
| Shallow clone | Git → Advanced clone behaviours → **Shallow clone, depth 1**, no tags |
| `.env` out of the workspace | Jenkins → Credentials → add a **Secret file** (`vm-tracker-env`). The job passes it with `docker compose --env-file "$ENV_FILE" …`. Jenkins puts it in a temporary location and removes it when the step ends |
| Delete the build cache | `docker builder prune -af` after the deploy. This removes the builder-stage layers that contain the source. The next build is a little slower because dependencies are installed again |
| Delete old images | `docker image prune -f` |
| Delete the workspace | **Workspace Cleanup** plugin: `cleanWs()`, or the freestyle post-build action "Delete workspace when build is done" |

**Jenkins plugins needed:** Credentials Binding (usually installed already), Workspace Cleanup.

### Pipeline sketch (for illustration)

```groovy
pipeline {
  agent any
  options { skipDefaultCheckout() }
  stages {
    stage('Checkout') {
      steps {
        checkout scmGit(
          branches: [[name: 'main']],
          extensions: [cloneOption(shallow: true, depth: 1, noTags: true)],
          userRemoteConfigs: [[url: '<repo-url>', credentialsId: 'github']]
        )
      }
    }
    stage('Build & run') {
      steps {
        withCredentials([file(credentialsId: 'vm-tracker-env', variable: 'ENV_FILE')]) {
          sh 'docker compose --env-file "$ENV_FILE" up -d --build'
        }
      }
    }
  }
  post {
    always {
      sh 'docker builder prune -af && docker image prune -f'
      cleanWs()
    }
  }
}
```

For a **freestyle** job, the equivalents are the Git "shallow clone" option,
"Use secret text(s) or file(s)" under Build Environment, and "Delete workspace
when build is done" under Post-build Actions.

### Steps to implement

1. Install the Workspace Cleanup plugin.
2. Add the `.env` contents to Jenkins Credentials as a **Secret file**.
3. Turn on shallow clone in the job's Git settings.
4. Change the build step to `docker compose --env-file "$ENV_FILE" up -d --build`.
5. Add the clean-up steps.
6. Run once, then check on the server that the workspace and build cache are gone (`docker system df`).
7. Delete any old `.env` files left in workspaces by hand.

### Pros and cons

| ✅ Pros | ❌ Cons |
|---|---|
| About an hour of work | The source is still on the server **during** the build (a few minutes) |
| No new server, tool or cost | Git and build tools stay installed on production |
| No more hand-copied `.env` | Jenkins, with all its stored secrets, still runs on the production server |
| Nothing left behind after the deploy | No quick rollback, because there is no registry |

---

## 6. Approach 3: Build on GitHub Actions, deploy with Jenkins (target)

**The idea:** the image is built on a **temporary GitHub machine** that is
deleted after each job, then stored in **GitHub Container Registry (ghcr.io)**.
Jenkins, which is inside our network, only tells the server to **pull the image
and restart**. The source never reaches any of our servers.

### Flow

```
        GITHUB (outside our network)
┌────────────────────────────────────────┐
│ 1. Push to main                        │
└───────────────────┬────────────────────┘
                    ▼  starts automatically
┌────────────────────────────────────────┐
│ 2. GitHub Actions (temporary machine)  │
│    clone → docker build                │
│    NEXT_PUBLIC_* from GitHub secrets   │
└───────────────────┬────────────────────┘
                    ▼
┌────────────────────────────────────────┐
│ 3. Push the image to ghcr.io           │
│    vm-tracker:<commit-sha>  and :main  │
└───────────────────┬────────────────────┘
                    ▼
     machine deleted, and the source with it
 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
        OUR NETWORK  ▼
┌────────────────────────────────────────┐
│ 4. Run the Jenkins "deploy" job        │  by hand, TAG = commit sha
│    (does NOT clone the repo)           │
└───────────────────┬────────────────────┘
                    ▼
┌────────────────────────────────────────┐
│ 5. On the server:                      │
│    docker compose pull                 │
│    docker compose up -d                │
└───────────────────┬────────────────────┘
                    ▼
┌────────────────────────────────────────┐
│ 6. Health check  (GET /login)          │── fails ──▶ re-run with the
└───────────────────┬────────────────────┘            previous TAG
                    ▼
┌────────────────────────────────────────┐
│ ✓ Server keeps: compose file + .env    │
│   + image. No source, no .git and no   │
│   build tools, at any point.           │
└────────────────────────────────────────┘
```

### What is on the server after

```
/opt/apps/vm-tracker/
├── docker-compose.yml       uses image: ghcr.io/<org>/vm-tracker:${TAG}
└── .env                     chmod 600, runtime secrets only

Docker                       the pulled image + the running container
```

### Why Jenkins deploys instead of GitHub

GitHub's machines are on the public internet. To deploy directly from GitHub,
production would have to accept SSH from **any** IP address. If our servers
aren't reachable from outside, it wouldn't work at all. Jenkins is already
inside our network, so it does the deploy step.

| Deploy option | How | Verdict |
|---|---|---|
| **A. Jenkins deploys** | Jenkins runs `pull` + `up -d` on the server | ⭐ Use this. It fits what we already have |
| B. The server pulls by itself | A tool such as Watchtower checks ghcr.io and restarts on a new image | No open ports, but less control over when a deploy happens |
| C. Private network link | GitHub joins our network for the job only (e.g. a Tailscale action) | Clean, but one more tool to set up and look after |

### Rollback

```
Version a1b2c3d is broken
        ▼
Run the Jenkins deploy job with TAG = 9f8e7d6   (previous version, still in ghcr.io)
        ▼
Back up in about 30 seconds, with no rebuild
```

### Cost

| GitHub plan | Free Actions minutes / month | Storage |
|---|---|---|
| Free | 2,000 | 500 MB |
| Pro / Team | 3,000 | 1 GB / 2 GB |
| Enterprise Cloud | 50,000 | 50 GB |

- The minutes are shared across the **whole organization**, not per repo.
- After the free minutes, a Linux machine costs **$0.006 per minute**.
- **ghcr.io storage and downloads for container images are currently free.**
  GitHub says it will give at least one month's notice before that changes.
- To guarantee we are never charged, set a **$0 budget with "stop usage"**
  under Billing.

```
One Next.js build ≈ 4–8 minutes (about 6 on average)
2,000 free minutes ÷ 6 ≈ 330 builds per month

Heavy month: 10 projects × 2 deploys a day × 22 days = 440 builds
440 × 6 = 2,640 minutes → 640 over the limit → about $4
```

*(Prices as of September 2026. See [Sources](#sources).)*

### Sketch: GitHub Actions workflow (builds and pushes)

```yaml
# .github/workflows/build.yml
on:
  push:
    branches: [main]
permissions:
  contents: read
  packages: write                 # lets GITHUB_TOKEN push to ghcr.io
jobs:
  build:
    runs-on: ubuntu-latest        # free, temporary Linux machine
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: |
            ghcr.io/<org>/vm-tracker:${{ github.sha }}
            ghcr.io/<org>/vm-tracker:main
          build-args: |
            NEXT_PUBLIC_SUPABASE_URL=${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=${{ secrets.NEXT_PUBLIC_SUPABASE_ANON }}
          cache-from: type=gha    # reuses layers, so builds are faster and use fewer minutes
          cache-to: type=gha,mode=max
```

### Sketch: Jenkins deploy job (never clones the repo)

```groovy
pipeline {
  agent any
  options { skipDefaultCheckout() }          // no source ever reaches the server
  parameters {
    string(name: 'TAG', defaultValue: 'main', description: 'Image tag (commit sha) to deploy')
  }
  stages {
    stage('Deploy') {
      steps {
        sh '''
          cd /opt/apps/vm-tracker
          TAG="$TAG" docker compose pull
          TAG="$TAG" docker compose up -d
          docker image prune -f
        '''
      }
    }
    stage('Health check') {
      steps { sh 'sleep 20 && curl -fsS http://127.0.0.1:5174/login > /dev/null' }
    }
  }
}
```

If Jenkins is **not** on the same server as the app, wrap the deploy commands in
`sshagent([...]) { sh 'ssh deploy@<server> "…"' }`. That needs the SSH Agent
plugin.

### Steps to implement

1. **Check the GitHub plan** of the organization and its free minutes.
2. **Add repo secrets** in GitHub: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON`.
3. **Add the workflow file** (above). Push once and confirm that the image appears
   under the org's Packages and is **private**. Image names must be lowercase.
4. **Create a read-only token** (with `read:packages`) for the server, then run
   `docker login ghcr.io` once on the server.
5. **Prepare the server:** create `/opt/apps/vm-tracker/` containing only
   `docker-compose.yml` and `.env` (`chmod 600`).
6. **Change the compose file:** replace the `build:` block with
   `image: ghcr.io/<org>/vm-tracker:${TAG:?}`.
   The compose file changes rarely, so copy it over by hand when it does.
   The deploy job must not clone the repo.
7. **Create the Jenkins deploy job** (above) with a `TAG` parameter.
8. **Deploy once and verify**, then clean up the old setup: delete the old
   workspace, run `docker builder prune -af`, and remove the old build job.
9. *(Optional)* uninstall git and build tools from the server.

### Pros and cons

| ✅ Pros | ❌ Cons |
|---|---|
| The source **never** reaches our servers | Build secrets (`NEXT_PUBLIC_*`) move into GitHub |
| Usually $0 per month | Depends on GitHub's free allowance, which could change |
| No new server to maintain | Two tools involved (GitHub Actions for builds, Jenkins for deploys) |
| One-click rollback to any previous version | The deploy is still one manual click (this can be automated later) |
| Every version is kept in the registry | |

---

## 7. Comparison

| | Current | Approach 1 | Approach 3 |
|---|---|---|---|
| Source on the server | ✅ always | only during the build | ❌ never |
| `.git` on the server | ✅ full history | almost none (depth 1) | ❌ never |
| `.env` handling | copied by hand | Jenkins secret file | locked file, `chmod 600` |
| Build tools on the server | yes | yes | no |
| Rollback | rebuild an old commit | rebuild an old commit | re-run with an old tag (about 30 s) |
| New tools | none | 1 Jenkins plugin | GitHub Actions + ghcr.io |
| Cost | $0 | $0 | usually $0 |
| Effort | none | about 1 hour | about 1 day |

**Suggested order:**

```
Now (this week)                    Next
┌──────────────────────┐          ┌────────────────────────────────┐
│ Approach 1           │ ───────▶ │ Approach 3                     │
│ quick win, stops the │          │ source never on our servers,   │
│ leftovers today      │          │ one project first, then the    │
└──────────────────────┘          │ rest                           │
                                  └────────────────────────────────┘
```

---

## 8. PHP projects

PHP source has to exist wherever the app runs, but both approaches still help:

- **Approach 1** applies as it is: shallow clone, `.env` from Jenkins, and clean-up.
- **Approach 3** applies with a PHP image. Code is baked into the image with
  `composer install --no-dev --optimize-autoloader`, and `.dockerignore` drops
  `.git`, tests, `.env` and docs.
- Inside the container:
  - the code is **read-only** and owned by root
  - nginx serves **only `/public`**, so `.php` files can't be downloaded as text
  - secrets come from environment variables, never a file under the web root

The code still exists inside the image, but it's no longer lying in a workspace
next to `.git` and `.env`, and it can't be edited in place.

---

## 9. To decide

1. Do we agree on **Approach 1 now, then Approach 3**?
2. **Which GitHub plan** is the organization on (for free minutes)?
3. Is **Jenkins on the same server** as the apps? This decides whether the
   deploy job runs locally or over SSH.
4. For Approach 3, is the **runtime `.env`** a locked file on the server, or a
   Jenkins secret file?
5. **Which project goes first** as the pilot?
6. Do we want **automatic deploys** on push to `main` later, or keep the manual
   deploy click?

---

## Sources

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages)
- [2026 pricing changes for GitHub Actions](https://github.com/resources/insights/2026-pricing-changes-for-github-actions)
