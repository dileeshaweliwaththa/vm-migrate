import { useMutation, useQuery } from '@tanstack/react-query';
import type { VmJenkinsConfig, VmJenkinsInput } from '@/types/common/jenkins';

// Hook layer: a VM's Jenkins server. The tracker payload already carries each
// VM's `jenkins` summary for the grid's markers, so the query here is only for
// the dialog — it re-reads the one VM being edited, on open.

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(json.error || 'Request failed.');
  return json.data as T;
}

export const vmJenkinsQueryKey = (vmId: string) => ['vm-jenkins', vmId] as const;

export const useVmJenkinsConfig = (vmId: string, enabled: boolean) =>
  useQuery({
    queryKey: vmJenkinsQueryKey(vmId),
    queryFn: () => apiFetch<VmJenkinsConfig | null>(`/api/vms/${vmId}/jenkins`),
    enabled,
    staleTime: 0,
  });

export const useSaveVmJenkinsConfig = () =>
  useMutation({
    mutationFn: ({ vmId, input }: { vmId: string; input: VmJenkinsInput }) =>
      apiFetch<VmJenkinsConfig>(`/api/vms/${vmId}/jenkins`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
  });

// Asks the server to reach this VM's Jenkins. Send the typed values to test
// before saving, or nothing to re-test the stored ones — the browser never holds
// the token, so that is the only way to verify it.
export const useTestVmJenkins = () =>
  useMutation({
    mutationFn: ({ vmId, input }: { vmId: string; input?: Partial<VmJenkinsInput> }) =>
      apiFetch<{ ok: boolean; message: string }>(`/api/vms/${vmId}/jenkins/test`, {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      }),
  });
