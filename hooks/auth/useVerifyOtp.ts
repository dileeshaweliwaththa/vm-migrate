import { useMutation } from '@tanstack/react-query';
import { ApiResponse } from '@/types/common';

interface VerifyOtpInput {
  email: string;
  token: string;
}

// Hook layer: verifies the emailed 6-digit code via the API/service layer.
export const useVerifyOtp = () => {
  return useMutation({
    mutationFn: async ({ email, token }: VerifyOtpInput): Promise<ApiResponse> => {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
      });
      const { response } = await res.json();
      return response as ApiResponse;
    },
  });
};
