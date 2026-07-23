import type { UserRole } from '@/types/common';

// RBAC helpers — the single place role capabilities are expressed, so pages,
// components, and services never re-derive them from magic strings.
// (Postgres RLS is the authoritative enforcement; these gate the UI/UX.)

export const DEFAULT_ROLE: UserRole = 'viewer';

export const isAdmin = (role: UserRole | null | undefined): boolean => role === 'admin';

export const canEdit = (role: UserRole | null | undefined): boolean =>
  role === 'admin' || role === 'editor';
