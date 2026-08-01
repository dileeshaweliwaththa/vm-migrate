import { ApiResponse } from '@/types/common';
import {
  getAuthenticatedUser,
  signInWithOtp,
  signOut,
  verifyEmailOtp,
} from '@/repositories/auth/authRepository';
import { findProfileById, findRoleById } from '@/repositories/profiles/profileRepository';
import { DEFAULT_ROLE } from '@/lib/rbac';
import type { UserRole } from '@/types/common';

// Service layer: business logic and use-case orchestration. Calls the
// repository layer, transforms results into domain types (ApiResponse), and
// owns all rules. Has no React dependency.

// auth-js falls back to JSON.stringify(response) for errors without a
// msg/message/error field (e.g. a 502/503/504 with a non-JSON body), which
// produces the unhelpful literal string "{}".
const authErrorMessage = (message: string | undefined, fallback: string): string => {
  if (!message || message === '{}') return fallback;
  if (message === 'email rate limit exceeded') {
    return 'Too many verification emails sent recently. Please wait a few minutes and try again.';
  }
  return message;
};

// Requests a passwordless sign-in code. Self-signup is disabled
// (`shouldCreateUser: false`), so only users an admin has provisioned can
// receive a code. We return a generic success message regardless of whether
// the email is registered, so the endpoint can't be used to enumerate which
// addresses exist (this also supersedes the old leaky existing-user check).
export const emailSignUp = async (email: string): Promise<ApiResponse> => {
  if (!email) {
    return {
      success: false,
      message: 'Email is required.',
    };
  }

  const { error } = await signInWithOtp(email, false);
  if (error && error.message === 'email rate limit exceeded') {
    return {
      success: false,
      message: authErrorMessage(error.message, 'Too many emails sent recently. Please wait a few minutes.'),
    };
  }

  return {
    success: true,
    message: 'If your email is registered, a 6-digit sign-in code is on its way.',
  };
};

export const verifyOtp = async (email: string, token: string): Promise<ApiResponse> => {
  if (!email || !token) {
    return {
      success: false,
      message: 'Email and code are required.',
    };
  }

  const { user, error } = await verifyEmailOtp(email, token);
  if (error || !user) {
    return {
      success: false,
      message: authErrorMessage(error?.message, 'Invalid or expired code.'),
    };
  }

  return {
    success: true,
    message: 'Signed in successfully.',
  };
};

export const logout = async (): Promise<ApiResponse> => {
  const { error } = await signOut();
  if (error) {
    return {
      success: false,
      message: authErrorMessage(error.message, 'Could not sign out. Please try again.'),
    };
  }

  return {
    success: true,
    message: 'Signed out successfully.',
  };
};

export const getCurrentUser = async () => {
  return getAuthenticatedUser();
};

// Resolves the signed-in user's global RBAC role. Returns null when there is
// no session; defaults to the least-privileged 'viewer' if the profile row has
// no role yet. UI and other services use this to gate admin/editor actions
// (the authoritative check remains role-based RLS in Postgres).
export const getCurrentRole = async (): Promise<UserRole | null> => {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const role = await findRoleById(user.id);
  return (role as UserRole | null) ?? DEFAULT_ROLE;
};

// Who is acting, for audit records: identity *and* role in one read, so a service
// that both gates on a role and stamps a row (e.g. recording who ran a build)
// doesn't resolve the session twice. The label is what a UI should display.
export interface CurrentActor {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export const getCurrentActor = async (): Promise<CurrentActor | null> => {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const profile = await findProfileById(user.id);
  return {
    id: user.id,
    email: user.email ?? '',
    name: profile?.name ?? '',
    role: (profile?.role as UserRole | null) ?? DEFAULT_ROLE,
  };
};
