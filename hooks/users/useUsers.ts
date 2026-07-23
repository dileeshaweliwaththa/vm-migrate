'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, UserRole } from '@/types/common';
import type { AppUser } from '@/types/common/user';

// Hook layer: bridges the admin user-management UI to /api/users. Components
// call these — never the service/repository layers directly.

const USERS_KEY = ['users'];

const readResponse = async (res: Response): Promise<ApiResponse> => {
  const json = await res.json();
  if (json?.response) return json.response as ApiResponse;
  return { success: false, message: json?.error ?? 'Something went wrong.' };
};

export const useUsers = () =>
  useQuery({
    queryKey: USERS_KEY,
    queryFn: async (): Promise<AppUser[]> => {
      const res = await fetch('/api/users');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load users.');
      return json.data as AppUser[];
    },
  });

export const useProvisionUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: UserRole; name?: string }) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return readResponse(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
};

export const useChangeUserRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      return readResponse(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
};

export const useRemoveUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      return readResponse(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
};
