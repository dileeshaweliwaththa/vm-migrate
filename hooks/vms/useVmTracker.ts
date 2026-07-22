import { useMutation, useQuery } from '@tanstack/react-query';
import type { Vm, VmUrl, VmInput, VmUrlInput, TrackerData, TrashType } from '@/types/common/vm';

// Hook layer: bridges the tracker UI to the API/service layer via TanStack
// Query. Components call these hooks — never services or repositories.

export const VMS_QUERY_KEY = ['vms'] as const;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(json.error || 'Request failed.');
  return json.data as T;
}

// The initial (and only, unless refetched) load of the whole tracker payload.
export const useTrackerData = () =>
  useQuery({
    queryKey: VMS_QUERY_KEY,
    queryFn: () => apiFetch<TrackerData>('/api/vms'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export const useCreateVm = () =>
  useMutation({
    mutationFn: (input: VmInput = {}) =>
      apiFetch<Vm>('/api/vms', { method: 'POST', body: JSON.stringify(input) }),
  });

export const useUpdateVm = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: VmInput }) =>
      apiFetch<Vm>(`/api/vms/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  });

export const useTrashVm = () =>
  useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string }>(`/api/vms/${id}`, { method: 'DELETE' }),
  });

export const useRestoreVm = () =>
  useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/vms/${id}/restore`, { method: 'POST' }),
  });

export const usePurgeVm = () =>
  useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/vms/${id}/purge`, { method: 'DELETE' }),
  });

export const useClearTrash = () =>
  useMutation({
    mutationFn: (type: TrashType) =>
      apiFetch<{ type: TrashType }>(`/api/vms/trash?type=${type}`, { method: 'DELETE' }),
  });

export const useAddUrl = () =>
  useMutation({
    mutationFn: ({ vmId, input }: { vmId: string; input?: VmUrlInput }) =>
      apiFetch<VmUrl>(`/api/vms/${vmId}/urls`, {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      }),
  });

export const useUpdateUrl = () =>
  useMutation({
    mutationFn: ({ vmId, urlId, input }: { vmId: string; urlId: string; input: VmUrlInput }) =>
      apiFetch<VmUrl>(`/api/vms/${vmId}/urls/${urlId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  });

export const useDeleteUrl = () =>
  useMutation({
    mutationFn: ({ vmId, urlId }: { vmId: string; urlId: string }) =>
      apiFetch<{ id: string }>(`/api/vms/${vmId}/urls/${urlId}`, { method: 'DELETE' }),
  });

export const useImportTracker = () =>
  useMutation({
    mutationFn: (payload: TrackerData) =>
      apiFetch<{ ok: boolean }>('/api/vms/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  });
