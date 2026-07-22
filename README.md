# VM Migration Tracker

An internal tool for tracking virtual machines and their endpoints through an
infrastructure migration — old IP → new IP, DNS status, per-URL testing, and
"safe to remove" verdicts — built on Next.js + Supabase with a strict
**5-layer architecture**.

## Tech stack

- Next.js (App Router) + TypeScript
- Supabase (Postgres + Auth)
- TanStack Query
- shadcn/ui + Tailwind CSS

## Features

- **VM grid** at `/tracker` split into **UPVIEW** (our servers) and **Client**
  sections, each VM expandable into its endpoint (URL) rows.
- **Per-endpoint tracking** — port, protocol, domain, auto-built "full new
  URL", DNS-updated and URL-tested flags.
- **Live stats** — VM/URL counts, migrated, DNS done, tested.
- **Safe-to-remove verdict** per VM (Supabase → not-migrating → migrated →
  pending).
- **Soft-delete trash** with restore / permanent purge and per-section
  "clear all"; purging a migrated VM **archives its URLs** onto the
  destination VM so nothing is lost.
- **JSON import / export** backup of the whole dataset.
- **Passwordless email sign-in** (Supabase magic link) guarding all
  protected screens.

## Getting started

```bash
npm install
cp env.local.sample .env.local   # fill in your Supabase URL + anon key
```

Apply the SQL migrations in [`sql/`](sql) **in order** via the Supabase SQL
Editor (`000` → `003`). See [docs/schema.md](docs/schema.md).

```bash
npm run dev     # http://localhost:3000  → redirects to /tracker
```

## Documentation

- [docs/architecture.md](docs/architecture.md) — the mandatory 5-layer model.
- [docs/tracker.md](docs/tracker.md) — how the VM tracker slice is wired.
- [docs/auth.md](docs/auth.md) — the email sign-in flow.
- [docs/schema.md](docs/schema.md) — database tables and the SQL workflow.
- [docs/ui-guidelines.md](docs/ui-guidelines.md) — shadcn/ui conventions.

## Definition of done

After any change, run `npm run build` (zero TypeScript errors) then
`npm run lint`.
