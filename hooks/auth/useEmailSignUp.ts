import { useMutation } from '@tanstack/react-query';
import { ApiResponse } from '@/types/common';

interface EmailSignUpInput {
  email: string;
  name?: string;
}

// Hook layer: bridges the UI to the API/service layer via TanStack Query.
// Owns request state (isPending/error). Components call this — never the
// service or repository layers directly.
export const useEmailSignUp = () => {
  return useMutation({
    mutationFn: async ({ email, name }: EmailSignUpInput): Promise<ApiResponse> => {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const { response } = await res.json();
      return response as ApiResponse;
    },
  });
};
