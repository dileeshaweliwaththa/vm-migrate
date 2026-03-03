# VM Migration Tracker

A lightweight, browser-based tool for tracking VM migrations — no backend, no database, no login required.

![VM Migration Tracker](./screenshot.png)

> All data is saved automatically in your browser's `localStorage`. Nothing is sent to any server.

---

## What it does

Track every VM across a migration from old infrastructure to new:

- **VMs** — name, old IP, new IP, migrated status, Supabase flag, notes
- **URLs / Endpoints** — per-VM list of ports, protocols, domains, DNS status, tested status
- **Safe to Remove** — auto-calculated per VM (`Yes` only if migrated and not Supabase)
- **Live stats** in the topbar — VMs, migrated count, DNS done, URLs tested

---

## Running locally

```bash
npm install
npx vite --open
```

App opens at **http://localhost:5173**

---

## Deploy (free, no account needed)

```bash
npx vite build
```

Drag the `dist/` folder onto **[netlify.com/drop](https://app.netlify.com/drop)** — get a live public URL instantly.

---

## Files

| File | Purpose |
|---|---|
| `vm_tracker.jsx` | Entire app — React component + data + styles |
| `index.html` | HTML entry point |
| `vite.config.js` | Vite + React JSX plugin config |
