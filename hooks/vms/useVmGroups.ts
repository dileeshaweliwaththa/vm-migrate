import { useMutation } from '@tanstack/react-query';
import type { VmGroup, VmGroupInput } from '@/types/common/vm';

// Hook layer: the VM group mutations. There is no `useQuery` here on purpose —
// the groups arrive inside the tracker payload (`useTrackerData`), so the grid
// reads them from the same local state as the rows it files under them.

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(json.error || 'Request failed.');
  return json.data as T;
}

export const useCreateVmGroup = () =>
  useMutation({
    mutationFn: (input: VmGroupInput) =>
      apiFetch<VmGroup>('/api/vm-groups', { method: 'POST', body: JSON.stringify(input) }),
  });

export const useUpdateVmGroup = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: VmGroupInput }) =>
      apiFetch<VmGroup>(`/api/vm-groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  });

export const useDeleteVmGroup = () =>
  useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/vm-groups/${id}`, { method: 'DELETE' }),
  });

// Files the given VMs under `groupId`, or ungroups them when it is null.
export const useAssignVmsToGroup = () =>
  useMutation({
    mutationFn: ({ vmIds, groupId }: { vmIds: string[]; groupId: string | null }) =>
      apiFetch<{ vmIds: string[]; groupId: string | null }>('/api/vm-groups/assign', {
        method: 'POST',
        body: JSON.stringify({ vmIds, groupId }),
      }),
  });
