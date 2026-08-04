# Deployment (Docker)

The app ships as a single container. Supabase is a hosted service, so there is no
database, cache or migration runner in the compose file — **schema changes are
applied separately** with `supabase db push` (see [schema.md](./schema.md)).

## Quick start

```bash
cp env.docker.sample .env      # compose reads .env for ${...} interpolation
docker compose up -d --build
docker compose ps              # wait for STATUS = healthy
docker compose logs -f app
```

Then open **`http://localhost:5174`**.

The port is fixed at **5174** in three places, deliberately not configurable by env
var: `PORT` in the Dockerfile, the `5174:5174` mapping in compose, and the `-p 5174`
flag on the `dev`/`start` npm scripts. Next cannot read `PORT` from an env file —
the HTTP server binds before env files are loaded — so a variable would have been
misleading. To move the port, change those three.

## The one thing that catches everyone: build-time vs runtime env

`NEXT_PUBLIC_*` variables are **inlined into the bundle by `next build`**.
Supplying them at `docker run` is too late — the browser receives `undefined` and
every Supabase call fails. They therefore have to be **build args**.

There is a second, sharper reason here: `lib/env.ts` calls `requireEnv` at
**module scope**, and every API route imports it transitively via
`lib/supabase/service.ts`. Build without those two values and `next build` dies
partway through *"Collecting page data"* with a stack trace that never mentions
Docker or env vars:

```
Error: Missing environment variable: NEXT_PUBLIC_SUPABASE_URL
Build error occurred
Error: Failed to collect page data for /api/projects/[id]/environments/[envId]/jenkins-jobs
```

The Dockerfile therefore checks both args up front and fails with a message that
names the actual problem.

| Variable | When | Secret? |
| -------- | ---- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | **build** arg + runtime | No — public by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` | **build** arg + runtime | No — reaches the browser, constrained by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime only | **Yes** — bypasses RLS |
| `GEMINI_API_KEY` | runtime only, optional | Yes — fallback when `app_settings` has no key |

The two public values are baked into image layers, which is expected: the anon
key is meant to reach the browser and is protected by RLS
([auth.md](./auth.md)).

**The service-role key is deliberately never a build arg.** It is read lazily per
request inside `createServiceClient()`, so it stays runtime-only and never lands
in an image layer. Keep it that way — anyone who can pull the image can read its
layers.

Both public values are *also* passed at runtime, because server-side code
(`lib/supabase/server.ts`, `proxy.ts`, `lib/env.ts`) reads `process.env` at
request time rather than relying on the inlined client values.

## How the image is built

Three stages, so a dependency change and a source change invalidate different
layers:

1. **deps** — `npm ci` against the lockfile only. Reused until dependencies change.
2. **builder** — full source + `npm run build`.
3. **runner** — copies only the build output. No npm, no lockfile, no
   devDependencies.

`next.config.ts` sets **`output: "standalone"`**, which emits
`.next/standalone/` — `server.js` plus only the `node_modules` Next actually
traced (~26 MB here). That is what the runner stage runs, with `node server.js`;
there is no `npm start` and no npm in the final image.

Standalone copies **neither** of these, so the Dockerfile copies both explicitly:

- `public/` → `./public`
- `.next/static/` → `./.next/static` (must land at exactly that path)

Two runtime details worth knowing:

- **`HOSTNAME=0.0.0.0`** is required. The standalone server defaults to
  localhost, which inside a container means unreachable from outside — a
  published port connects and hangs.
- **`libc6-compat`** is installed on Alpine (musl vs glibc). Without it some
  native dependencies fail to load with an opaque error.

The container runs as a non-root user (`nextjs`, uid 1001) with
`no-new-privileges` and a **read-only root filesystem**. All state lives in
Supabase, so the only writable paths are two tmpfs mounts: `/tmp`, and
`/app/.next/cache` because Next may create its data cache at runtime even though
the build produces no cache directory. Drop `read_only` if a future feature needs
real disk.

## The build needs outbound network access

`app/layout.tsx` uses `next/font/google` (Geist + Geist Mono), which Next
**downloads at build time**. On a machine without egress to
`fonts.googleapis.com` — an air-gapped CI runner, or a proxy that blocks it — the
build fails with only:

```
Error while requesting resource
> Build error occurred
```

Nothing in that message mentions fonts or the network. It is also intermittent: a
flaky DNS lookup produces the same failure, and a retry succeeds. If it turns up
in CI, either allow that host from the builder or vendor the fonts with
`next/font/local`.

## Health check

Both the Dockerfile and compose check `GET /login` — the only public,
statically-prerendered page, so it needs no session and makes no database round
trip. It answers "is the server serving?" and nothing more. It uses Node's global
`fetch` rather than curl or wget, neither of which is guaranteed in the image.

If you want a check that also proves Supabase connectivity, add a dedicated
`/api/health` route — but note every other API route requires a session, so a new
unauthenticated endpoint is new public surface and should return no data.

## Building without compose

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://your-ref.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY="your-anon-key" \
  -t upview-vm-tracker:latest .

docker run -d --name upview-vm-tracker -p 5174:5174 \
  -e SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  -e NEXT_PUBLIC_SUPABASE_URL="https://your-ref.supabase.co" \
  -e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY="your-anon-key" \
  upview-vm-tracker:latest
```

## Before going live

- **Apply pending migrations.** `supabase db push`. The container never touches
  the schema. As of this writing `…_restrict_vm_tracker_writes.sql` is committed
  but unapplied — until it is pushed, RLS still permits viewer writes to the VM
  tracker (the service layer blocks them, so this is missing defence-in-depth
  rather than an open hole).
- **Terminate TLS in front of the container.** It serves plain HTTP on 5174. Put
  a reverse proxy (nginx, Caddy, an ALB) in front, and make sure it forwards
  `X-Forwarded-Proto` so Supabase auth cookies are treated as secure.
- **Set the Supabase redirect/site URL** to the public origin, or the emailed
  sign-in codes will point at the wrong host.
- **Rotate the service-role key** if it has ever been committed or pasted into a
  build log.

## Updating

```bash
git pull
docker compose up -d --build     # rebuild + recreate
docker image prune -f            # drop the superseded image
```

Rebuild is required for any change to a `NEXT_PUBLIC_*` value — it is compiled
in, so restarting with new env alone will not pick it up.

## Not verified

These files were written against this repo's actual build output (standalone
layout and the missing-env failure were both reproduced locally) but **the image
build itself has not been run** — Docker isn't installed in the environment they
were authored in. Expect to shake out small issues on first `docker compose
up --build`.
