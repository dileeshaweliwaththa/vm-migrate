import type { Vm, Protocol } from '@/types/common/vm';

// Presentation helpers for the VM tracker. Pure functions, no React, no data
// access — shared by the tracker UI components.

// Builds the "full new URL" shown next to each endpoint, collapsing the
// default port for HTTP/HTTPS (mirrors the original tracker behavior).
export function buildFullUrl(proto: Protocol, newIp: string, port: string): string {
  if (!newIp) return '';
  const p = proto.toLowerCase();
  if ((p === 'https' && port === '443') || (p === 'http' && port === '80')) {
    return `${p}://${newIp}`;
  }
  return port ? `${p}://${newIp}:${port}` : `${p}://${newIp}`;
}

export type StatusTone = 'success' | 'info' | 'warning' | 'danger';

export interface VmStatus {
  label: string;
  tone: StatusTone;
}

// The "Safe to Remove?" verdict for a VM, matching the original precedence:
// Supabase > keep (not migrating) > migrated (safe) > pending.
export function safeStatus(vm: Vm): VmStatus {
  if (vm.isSupabase) return { label: 'NO - Supabase', tone: 'danger' };
  if (vm.keep) return { label: 'Not Migrating', tone: 'info' };
  if (vm.migrated) return { label: 'Safe to Remove', tone: 'success' };
  return { label: 'Pending', tone: 'warning' };
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
};

export interface TrackerStats {
  vms: number;
  migrated: number;
  supa: number;
  keeping: number;
  urls: number;
  dns: number;
  tested: number;
}

// Topbar counters, computed over the active (non-trashed) VMs.
export function computeStats(vms: Vm[]): TrackerStats {
  const urls = vms.flatMap((vm) => vm.urls);
  return {
    vms: vms.length,
    migrated: vms.filter((vm) => vm.migrated).length,
    supa: vms.filter((vm) => vm.isSupabase).length,
    keeping: vms.filter((vm) => vm.keep).length,
    urls: urls.length,
    dns: urls.filter((u) => u.dns).length,
    tested: urls.filter((u) => u.tested).length,
  };
}
