# Roles (RBAC)

Three roles, one per user, stored on the profile. This page is the role model;
[auth.md § Where access is enforced](./auth.md#where-access-is-enforced) is
where each check runs.

## The roles

| Role | In one line |
| --- | --- |
| `viewer` | Reads everything; runs Jenkins builds and health checks |
| `editor` | Everything a viewer can, plus ordinary editing across the app |
| `admin` | Everything, including users, settings, backups and irreversible deletes |

`profiles.role` is the Postgres enum `user_role` (`viewer`, `editor`, `admin`),
default `viewer`. TypeScript has the same values in the same order as
`USER_ROLES` in `types/common/index.ts`, with `DEFAULT_ROLE = 'viewer'` in
[lib/rbac.ts](../lib/rbac.ts).

## Asking for a role

**In TypeScript**, a service reads the caller's role with `getCurrentRole()`
(or `getCurrentActor()` for id + name + role) from `services/auth/authService.ts`
and asks a helper in `lib/rbac.ts`:

| Helper | True for |
| --- | --- |
| `isAdmin(role)` | `admin` |
| `canEdit(role)` | `editor`, `admin` |
| `canRunBuild(role)` | every signed-in role (each run is attributed) |
| `canCheckHealth(role)` | every signed-in role (it only probes stored addresses) |

**Never compare role strings inline.** No `role === 'admin'` in a page,
component or service: use a helper, and add one when a new capability needs a
name. The helpers are unit-tested (`lib/rbac.test.ts`) because every check in
the app goes through them.

**In SQL**, `public.current_user_role()` returns the caller's role. It is
`SECURITY DEFINER` so a policy can read `profiles` without recursing through
that table's own RLS. The standard policy set on a table:

| Operation | Allowed when |
| --- | --- |
| `select` | any authenticated user |
| `insert` / `update` | `current_user_role() in ('editor', 'admin')` |
| `delete` | `current_user_role() = 'admin'` |

Exceptions are deliberate and documented with their feature: the Backups
tables gate all writes on `admin` ([backups.md](./backups.md#permissions)),
the VM tracker has its own split ([tracker.md](./tracker.md#permissions)), and
the secrets tables have RLS on with **no** policies, so only server code
using the service-role client can touch them.

## Who can do what

| Area | viewer | editor | admin |
| --- | --- | --- | --- |
| Dashboard, VMs, VM pages | read, run health checks | same | same |
| VM tracker | read, export | edit, archive and restore VMs and URLs, addresses, groups | replace-all import (no one can delete a VM) |
| Projects, environments, records | read, run builds | create, edit, archive, Jenkins config and sync | see archived, delete |
| Documentation | read | edit, generate with AI | same |
| Backups | read everything | read everything | everything else |
| Users (`/admin/users`) | — | — | provision, change role, remove |
| Settings (`/admin/settings`) | — | — | all |

Each feature doc has the detailed table: [tracker.md](./tracker.md#permissions),
[projects.md](./projects.md#permissions), [backups.md](./backups.md#permissions),
[vms.md](./vms.md).

## Accounts

**There is no self-signup.** The sign-in code is only sent to an address that
already has an account (`shouldCreateUser: false`), and only an admin can
create one, from `/admin/users` (`provisionUser`), choosing its role. See
[auth.md](./auth.md).

`userService` guards the two ways an admin could lock everyone out:

- the **last admin** can't be demoted (promote someone else first);
- an admin can't **remove their own** account.

The admin pages redirect non-admins to `/dashboard`, and every `userService`
call re-checks `requireAdmin()`, because the user repository uses the
service-role client and RLS doesn't apply to it.

## Adding a capability

1. Decide the minimum role, and add a helper to `lib/rbac.ts` if no existing
   one names it. Test it in `lib/rbac.test.ts`.
2. Enforce it in the service, and in RLS when the table allows it. Where the
   service uses the service-role client, the service check is the only one, so
   it must exist ([auth.md](./auth.md#where-access-is-enforced)).
3. Use the same helper in the page or component to decide what renders. That is
   only an affordance, never the enforcement.
4. Add the row to the feature doc's permissions table and to the table above.
