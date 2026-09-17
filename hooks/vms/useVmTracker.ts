import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  Vm,
  VmIp,
  VmUrl,
  VmInput,
  VmIpInput,
  VmIpMoveInput,
  VmUrlInput,
  TrackerData,
} from '@/types/common/vm';

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

// ---- addresses -------------------------------------------------------------
// A VM's extra public addresses. Its own address is a field on the VM and is
// saved through `useUpdateVm` like any other field.

export const useAddVmIp = () =>
  useMutation({
    mutationFn: ({ vmId, input }: { vmId: string; input: VmIpInput }) =>
      apiFetch<VmIp>(`/api/vms/${vmId}/ips`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });

export const useUpdateVmIp = () =>
  useMutation({
    mutationFn: ({ vmId, ipId, input }: { vmId: string; ipId: string; input: VmIpInput }) =>
      apiFetch<VmIp>(`/api/vms/${vmId}/ips/${ipId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  });

export const useDeleteVmIp = () =>
  useMutation({
    mutationFn: ({ vmId, ipId }: { vmId: string; ipId: string }) =>
      apiFetch<{ id: string }>(`/api/vms/${vmId}/ips/${ipId}`, { method: 'DELETE' }),
  });

// Takes another VM's address onto this one. Touches three things server-side (the
// address, that VM's URLs, that VM's trashed flag), so the tracker refetches
// after it rather than trying to mirror all three locally.
export const useMoveVmIp = () =>
  useMutation({
    mutationFn: ({ vmId, input }: { vmId: string; input: VmIpMoveInput }) =>
      apiFetch<VmIp>(`/api/vms/${vmId}/ips/move`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });

export const useImportTracker = () =>
  useMutation({
    mutationFn: (payload: TrackerData) =>
      apiFetch<{ ok: boolean }>('/api/vms/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  });
