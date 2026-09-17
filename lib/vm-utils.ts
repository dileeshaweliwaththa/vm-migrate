import type { Vm, VmGroup, VmIp, VmIpOrigin, VmUrl, Protocol } from '@/types/common/vm';

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

// ---- addresses -------------------------------------------------------------

// One address a VM answers on, as anything that lists them wants it: the
// machine's primary and its adopted extras in one shape, so a picker or a band
// doesn't special-case the first entry.
//
// `id` is null for the primary, because the primary is a **column** on the VM
// (`new_ip`), not a `vm_ips` row — the same null that `VmUrl.ipId` uses to mean
// "the machine's own address".
export interface VmAddress {
  id: string | null;
  address: string;
  label: string;
  origin: VmIpOrigin;
  // The machine this address was reattached from, when it was reattached at all.
  sourceName: string;
  movedAt: string;
  primary: boolean;
}

const primaryAddress = (vm: Pick<Vm, 'newIp'>): VmAddress => ({
  id: null,
  address: vm.newIp,
  label: '',
  origin: 'assigned',
  sourceName: '',
  movedAt: '',
  primary: true,
});

const extraAddress = (ip: VmIp): VmAddress => ({
  id: ip.id,
  address: ip.address,
  label: ip.label,
  origin: ip.origin,
  sourceName: ip.sourceVmName,
  movedAt: ip.movedAt,
  primary: false,
});

// Every address a VM answers on, primary first. A machine with no adopted
// addresses yields exactly one entry, which is why nothing that predates `vm_ips`
// needed to change.
export function vmAddresses(vm: Pick<Vm, 'newIp' | 'ips'>): VmAddress[] {
  return [primaryAddress(vm), ...(vm.ips ?? []).map(extraAddress)];
}

// The address a single endpoint answers on. `ipId` names one of the VM's adopted
// addresses; null — and an id whose address has since been removed — means the
// machine's own. Falling back rather than rendering nothing is deliberate: the
// FK is `on delete set null`, so a removed address leaves live rows behind and
// they have to keep resolving somewhere.
export function endpointAddress(
  vm: Pick<Vm, 'newIp' | 'ips'>,
  url: Pick<VmUrl, 'ipId'>
): string {
  if (!url.ipId) return vm.newIp;
  return (vm.ips ?? []).find((ip) => ip.id === url.ipId)?.address ?? vm.newIp;
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
// The **shape** every status label shares, next to the tones so a pill is one
// decision rather than a string copied into a dozen call sites.
//
// `rounded-sm` (4px), not `rounded-full`: the design's shape language is
// "precision-molded, not bubbly" and everything else on a page — cards, inputs,
// chips, buttons — sits on that 4/8px scale. A capsule among them read as a
// different system. `rounded-full` stays for things that are actually round:
// avatars, the live dots, the progress bar.
export const STATUS_PILL_CLASS =
  'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-semibold whitespace-nowrap';

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
//
// An **adopted address** (`vm_ips`, origin `moved`) is deliberately not listed
// here, even though it is also history. Its endpoints are live rows on this VM
// rather than a snapshot of a machine that no longer serves them, so listing them
// again below would render every one of them twice. Where that address came from
// is shown once, in the Addresses band, next to the address itself.
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

// A group and the VMs filed under it. `group: null` is the ungrouped remainder —
// every VM starts there, and it stays the normal state for a machine that isn't
// part of a client's fleet.
export interface VmGrouping {
  group: VmGroup | null;
  vms: Vm[];
}

// Splits a section's VMs into their groups for rendering: each group that has
// members here, in the order the groups arrive (by name, from the repository),
// then the ungrouped ones last.
//
// Only groups with a member in *this* list appear. A section renders one half of
// the tracker (UPVIEW or Client), so a group whose VMs all sit on the other side
// would otherwise draw an empty header — and an empty group would draw one in
// both. The full group list still reaches the "add to group" menu, which is what
// keeps an empty group reachable.
export function groupVms(vms: Vm[], groups: VmGroup[]): VmGrouping[] {
  const byGroup = new Map<string, Vm[]>();
  const ungrouped: Vm[] = [];

  for (const vm of vms) {
    // A `groupId` pointing at a group that isn't in the payload counts as
    // ungrouped rather than vanishing from the grid.
    if (!vm.groupId || !groups.some((g) => g.id === vm.groupId)) {
      ungrouped.push(vm);
      continue;
    }
    const list = byGroup.get(vm.groupId) ?? [];
    list.push(vm);
    byGroup.set(vm.groupId, list);
  }

  const grouped: VmGrouping[] = groups
    .filter((group) => byGroup.has(group.id))
    .map((group) => ({ group, vms: byGroup.get(group.id) ?? [] }));

  return ungrouped.length ? [...grouped, { group: null, vms: ungrouped }] : grouped;
}
