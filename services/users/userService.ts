import type { ApiResponse, ApiSingleResponse, UserRole } from '@/types/common';
import type { AppUser } from '@/types/common/user';
import { getAuthenticatedUser } from '@/repositories/auth/authRepository';
import { getCurrentRole } from '@/services/auth/authService';
import {
  adminListProfiles,
  adminCreateAuthUser,
  adminUpsertProfile,
  adminUpdateRole,
  adminDeleteAuthUser,
} from '@/repositories/users/userRepository';

// Service layer: admin user management. Every entry point re-checks that the
// caller is an admin (against their real session) before touching the
// service-role repository, so RLS-bypassing calls can never be reached by a
// non-admin. Has no React dependency.

const ROLES: UserRole[] = ['viewer', 'editor', 'admin'];

const requireAdmin = async (): Promise<ApiResponse | null> => {
  const role = await getCurrentRole();
  if (role !== 'admin') return { success: false, message: 'Admin access required.' };
  return null;
};

const serviceRoleHint =
  'Admin user management needs SUPABASE_SERVICE_ROLE_KEY configured on the server.';

const asError = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('SUPABASE_SERVICE_ROLE_KEY')) return serviceRoleHint;
  return message || fallback;
};

export const listUsers = async (): Promise<ApiSingleResponse<AppUser[]>> => {
  const denied = await requireAdmin();
  if (denied) return { ...denied, data: null };
  try {
    const rows = await adminListProfiles();
    const data: AppUser[] = rows.map((r) => ({
      id: r.id,
      email: r.email ?? null,
      name: r.name ?? null,
      role: (r.role as UserRole) ?? 'viewer',
      createdAt: r.created_at,
    }));
    return { success: true, message: 'OK', data };
  } catch (error) {
    return { success: false, message: asError(error, 'Failed to load users.'), data: null };
  }
};

export const provisionUser = async (
  email: string,
  role: UserRole,
  name?: string
): Promise<ApiResponse> => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) return { success: false, message: 'Email is required.' };
  if (!ROLES.includes(role)) return { success: false, message: 'Invalid role.' };

  try {
    const { user, error } = await adminCreateAuthUser(cleanEmail, name?.trim() || undefined);
    if (error || !user) {
      return { success: false, message: asError(error, 'Could not create the user.') };
    }
    const { error: profileError } = await adminUpsertProfile(
      user.id,
      cleanEmail,
      name?.trim() || undefined,
      role
    );
    if (profileError) {
      return { success: false, message: asError(profileError, 'User created but the role was not set.') };
    }
    return {
      success: true,
      message: `Invited ${cleanEmail} as ${role}. They can sign in with an email code.`,
    };
  } catch (error) {
    return { success: false, message: asError(error, 'Could not invite the user.') };
  }
};

export const changeUserRole = async (id: string, role: UserRole): Promise<ApiResponse> => {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!ROLES.includes(role)) return { success: false, message: 'Invalid role.' };
  try {
    const { error } = await adminUpdateRole(id, role);
    if (error) return { success: false, message: asError(error, 'Could not update the role.') };
    return { success: true, message: 'Role updated.' };
  } catch (error) {
    return { success: false, message: asError(error, 'Could not update the role.') };
  }
};

export const removeUser = async (id: string): Promise<ApiResponse> => {
  const denied = await requireAdmin();
  if (denied) return denied;
  const me = await getAuthenticatedUser();
  if (me?.id === id) return { success: false, message: 'You cannot remove your own account.' };
  try {
    const { error } = await adminDeleteAuthUser(id);
    if (error) return { success: false, message: asError(error, 'Could not remove the user.') };
    return { success: true, message: 'User removed.' };
  } catch (error) {
    return { success: false, message: asError(error, 'Could not remove the user.') };
  }
};
