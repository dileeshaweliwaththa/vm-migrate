'use client';

import { useQuery } from '@tanstack/react-query';
import type { VmDetail, VmHealthReport } from '@/types/common/vm';

// Hook layer: the VM page (docs/vms.md) — the machine's resources, and its live
// endpoint health. Components call these, never the service.

export const vmDetailKey = (id: string) => ['vm-detail', id] as const;
export const vmHealthKey = (id: string) => ['vm-health', id] as const;

// A health check is a live snapshot and costs outbound requests, so it isn't
// refetched on focus; it runs once when the page opens and again on "Check now".
const HEALTH_STALE_MS = 60_000;

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw Object.assign(new Error(json.error || fallback), { status: res.status });
  return json.data as T;
}

export const useVmDetail = (id: string) =>
  useQuery({
    queryKey: vmDetailKey(id),
    // The breadcrumb calls this on every page with an empty id.
    enabled: Boolean(id),
    queryFn: () => getJson<VmDetail>(`/api/vms/${id}`, 'Failed to load the VM.'),
    // A 404 won't become a VM by asking again.
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });

export const useVmHealth = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: vmHealthKey(id),
    enabled,
    retry: false,
    staleTime: HEALTH_STALE_MS,
    refetchOnWindowFocus: false,
    queryFn: () => getJson<VmHealthReport>(`/api/vms/${id}/health`, 'Health check failed.'),
  });
