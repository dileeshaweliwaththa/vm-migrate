'use client';

import { useQuery } from '@tanstack/react-query';

// Lightweight list of existing VMs for the environment VM picker. Reuses the
// tracker's GET /api/vms payload ({ vms, deleted }).
export interface VmOption {
  id: string;
  name: string;
  isClient: boolean;
}

export const useVmOptions = () =>
  useQuery({
    queryKey: ['vm-options'],
    queryFn: async (): Promise<VmOption[]> => {
      const res = await fetch('/api/vms');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load VMs.');
      const vms = (body.data?.vms ?? []) as { id: string; name: string; isClient: boolean }[];
      return vms.map((v) => ({ id: v.id, name: v.name, isClient: v.isClient }));
    },
  });
