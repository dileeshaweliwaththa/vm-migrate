import { ApiResponse } from '@/types/common';
import {
  getAuthenticatedUser,
  signInWithOtp,
  signOut,
  verifyEmailOtp,
} from '@/repositories/auth/authRepository';
import { findProfileByEmail, findRoleById } from '@/repositories/profiles/profileRepository';
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

export const emailSignUp = async (email: string, name?: string): Promise<ApiResponse> => {
  if (!email) {
    return {
      success: false,
      message: 'Email is required.',
    };
  }

  const existingUser = await findProfileByEmail(email);
  if (existingUser) {
    return {
      success: false,
      message: 'Account already exists. Please login.',
    };
  }

  const { error } = await signInWithOtp(email, true, name?.trim() || undefined);
  if (error) {
    return {
      success: false,
      message: authErrorMessage(
        error.message,
        'Could not send the sign-in email. Please try again in a moment.'
      ),
    };
  }

  return {
    success: true,
    message: 'Magic link sent successfully. Please check your inbox.',
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
  return (role as UserRole | null) ?? 'viewer';
};
