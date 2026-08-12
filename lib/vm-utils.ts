import type { Vm, VmUrl, Protocol } from '@/types/common/vm';

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

// The app's whole status vocabulary, in one place. These resolve to the
// `--tone-*` variables in globals.css, which are themed per mode — so a tone is
// declared once here and never needs a `dark:` counterpart at the call site.
//
// Each tone carries a real hue: success green, warning amber, danger red, info
// blue. Every pill that uses them also renders its label as text, so no meaning
// depends on colour alone — which is what makes the hue cue safe rather than
// load-bearing. See docs/ui-guidelines.md § Theme.
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-tone-success text-tone-success-fg',
  info: 'bg-tone-info text-tone-info-fg',
  warning: 'bg-tone-warning text-tone-warning-fg',
  danger: 'bg-tone-danger text-tone-danger-fg',
};

// Where a VM's endpoints came from. A VM is a "primary" destination when its old
// and new IP are the same — nothing moved, so it is the address others moved
// *onto* — and its sources are every VM pointing at that IP from somewhere else,
// in three states: still active, in the trash, or purged and archived onto this
// row. The archived entries are already this shape, which is why the return type
// is a subset of `Vm` rather than `Vm` itself (it also removes a cast that
// claimed an archive entry was a whole VM).
//
// Derived here rather than in a component because both tracker views render it,
// and a second copy of the matching rule is a second answer to "what migrated
// onto this box".
export type MigratedTag = 'IN TRASH' | 'ARCHIVED';

export interface MigratedSource {
  id: string;
  name: string;
  oldIp: string;
  newIp: string;
  urls: VmUrl[];
  // null when the source is still an active VM in the grid.
  tag: MigratedTag | null;
}

export function migratedSources(vm: Vm, allVms: Vm[], allDeleted: Vm[]): MigratedSource[] {
  const isPrimary = vm.oldIp === vm.newIp && !!vm.newIp;
  if (!isPrimary) return [];

  const movedOntoThis = (s: { newIp: string; oldIp: string }) =>
    s.newIp === vm.newIp && s.oldIp !== s.newIp;

  const entry = (
    s: { id: string; name: string; oldIp: string; newIp: string; urls: VmUrl[] },
    tag: MigratedTag | null
  ): MigratedSource => ({
    id: s.id,
    name: s.name,
    oldIp: s.oldIp,
    newIp: s.newIp,
    urls: s.urls,
    tag,
  });

  return [
    ...allVms.filter((s) => s.id !== vm.id && movedOntoThis(s)).map((s) => entry(s, null)),
    ...allDeleted.filter(movedOntoThis).map((s) => entry(s, 'IN TRASH')),
    ...(vm.migratedArchive ?? []).map((s) => entry(s, 'ARCHIVED')),
  ];
}

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
