import { USER_ROLES, type UserRole } from '@/types/common';

// RBAC helpers — the single place role capabilities are expressed, so pages,
// components, and services never re-derive them from magic strings.
// (Postgres RLS is the authoritative enforcement; these gate the UI/UX.)

export const DEFAULT_ROLE: UserRole = 'viewer';

export const isAdmin = (role: UserRole | null | undefined): boolean => role === 'admin';

export const canEdit = (role: UserRole | null | undefined): boolean =>
  role === 'admin' || role === 'editor';

// Running a CI/CD build (and following it) is open to **every** signed-in role,
// viewers included: triggering a deploy job is an everyday action for the whole
// team. What replaces the editor gate is attribution — each run is recorded in
// `environment_build_runs` with the user who started it. Anything that *changes
// configuration* (Jenkins credentials, records, ports) still needs canEdit.
export const canRunBuild = (role: UserRole | null | undefined): boolean =>
  USER_ROLES.includes(role as UserRole);
