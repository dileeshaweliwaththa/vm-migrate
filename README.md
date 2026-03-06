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
| `Dockerfile` | Dockerfile to build a production container |

## What's New (Mar 2026)

This release adds a few workflow and UI improvements to better handle "client" VMs and ensure migrated URLs are preserved:

- **Client VM toggle:** Each VM row now has a small `UV` / `CLIENT` toggle. VMs default to the UPVIEW (our servers) group; toggle a VM to mark it as a Client VM and it will move to the **CLIENT VMs** section.
- **Separate sections:** The main table is split into two sections: **UPVIEW VMs — Our Servers** and **CLIENT VMs**, each with its own header and VM count.
- **Deleted (trash) split:** The trash area at the bottom now shows deleted UPVIEW and deleted CLIENT VMs in separate collapsible lists. Each list has its own "Clear All" and restore/delete controls.
- **Migrated URL preservation:** When a VM that originally migrated its URLs to another VM is permanently removed from the trash, its migrated URLs are preserved and archived on the destination VM so you won't lose sub-URLs that are already migrated.
- **Migrated badge color:** The read-only `MIGRATED` pill in migrated-source rows is now green to indicate success (rather than red).

These changes are backwards-compatible with existing saved data: existing VMs will stay in place (they default to the UPVIEW section). New fields added to the data model are `isClient` (boolean) and `migratedArchive` (array) and are created automatically when needed.
