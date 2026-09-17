import type { VmJenkinsConfig } from '@/types/common/jenkins';

// Domain types for the VM Migration Tracker. These are the shapes the UI and
// hook layers work with: camelCase and real booleans. The service layer maps
// raw Supabase rows (snake_case) into these.

export const PROTOCOLS = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'WS', 'WSS'] as const;
export type Protocol = (typeof PROTOCOLS)[number];

// How an extra address ended up on a machine. `assigned` is one we allocated to
// a live VM; `moved` is one detached from another machine and reattached here,
// which is what happens when a box is retired without touching its DNS.
//
// Not the same question as "does it name a source VM": an address moved off a
// machine that was never tracked here is still `moved`. Mirrors the `vm_ip_origin`
// Postgres enum — same values, same order.
export const VM_IP_ORIGINS = ['assigned', 'moved'] as const;
export type VmIpOrigin = (typeof VM_IP_ORIGINS)[number];

// One of the **additional** public addresses a VM answers on. The machine's own
// address is `Vm.newIp`; this is everything beyond it, so a single-address VM has
// an empty `ips` and behaves exactly as it always has.
//
// `sourceVmName` is a snapshot rather than something read through `sourceVmId`
// because the FK is `on delete set null` — the name has to outlive the machine,
// since the provenance matters most once that machine is gone.
export interface VmIp {
  id: string;
  vmId: string;
  address: string;
  label: string;
  origin: VmIpOrigin;
  sourceVmId: string | null;
  sourceVmName: string;
  // ISO date (yyyy-mm-dd), or empty when it wasn't recorded.
  movedAt: string;
  position: number;
  notes: string;
}

// An endpoint on a VM, as the tracker shows it. Backed by the single `endpoints`
// table, which is also what the projects pages write — so a URL added to a
// project environment appears here, under whichever VM that environment sits on,
// with no second copy anywhere.
export interface VmUrl {
  id: string;
  // The VM this row appears under. Stored on the row for a VM-owned endpoint;
  // derived from the environment's VM for a project's record.
  vmId: string;
  port: string;
  proto: Protocol;
  url: string;
  dns: boolean;
  tested: boolean;
  notes: string;
  position: number;
  // Which of the VM's addresses this endpoint answers on — a `VmIp.id`, or null
  // for the VM's primary (`Vm.newIp`). Null is what every row meant before a VM
  // could hold more than one address, so it stays the default.
  ipId: string | null;
  // ---- ownership -----------------------------------------------------------
  // Null for a VM-owned row — one added from the tracker for a machine with no
  // project behind it. Otherwise this row belongs to a project environment: the
  // tracker shows and edits it, but only the project can create or delete it.
  environmentId: string | null;
  projectId: string | null;
  // Labels for the row's badge, empty on a VM-owned row.
  projectName: string;
  projectSlug: string;
  environmentName: string;
  // The environment's optional display name, so a record's badge can tell two
  // DEVs on this VM apart. Composed with the stage by `environmentTitle`.
  environmentLabel: string;
}

// A source VM whose URLs were migrated onto a destination, preserved on the
// destination row as jsonb so its endpoints survive the source going away.
//
// **Historical.** These were written by the old purge-with-archive path, which
// existed because purging destroyed the source. Nothing writes them any more
// (beyond a backup import carrying them back in) — a VM is no longer deleted by
// the app at all, so the source row itself is the record. The grid still reads
// them, so entries written before that change keep rendering.
export interface MigratedArchiveEntry {
  id: string;
  name: string;
  oldIp: string;
  newIp: string;
  urls: VmUrl[];
}

// A named group of VMs — one client's fleet, typically (every EUKHOST-* machine
// under one "EUKHOST" header). One group holds many VMs; a VM belongs to at most
// one, which is what makes the tracker's grouped rendering possible: a row has
// exactly one place to appear.
export interface VmGroup {
  id: string;
  name: string;
  notes: string;
}

export interface Vm {
  id: string;
  name: string;
  oldIp: string;
  newIp: string;
  migrated: boolean;
  isSupabase: boolean;
  keep: boolean;
  isClient: boolean;
  expanded: boolean;
  notes: string;
  migratedArchive: MigratedArchiveEntry[];
  deleted: boolean;
  deletedAt: string | null;
  // The group this VM belongs to, or null for an ungrouped one. Ungrouped is the
  // normal state, not a defect — grouping is opt-in per VM.
  groupId: string | null;
  // This VM's Jenkins server, or null when none is configured. A VM runs one
  // Jenkins, so the server, its user and its token belong to the machine and the
  // environments on it only name their jobs. Secret-free: `hasToken` is a
  // boolean. Set by the tracker payload; a VM built straight from a row (a
  // create, an import) has none until it is configured.
  jenkins: VmJenkinsConfig | null;
  // Addresses this machine answers on **beyond** `newIp` — usually one adopted
  // from a retired VM. Empty for the ordinary single-address machine, which is
  // why nothing that predates this had to change.
  ips: VmIp[];
  urls: VmUrl[];
}

// The full tracker payload: active VMs, trashed (soft-deleted) VMs, and every
// group. The groups travel with the VMs rather than in a query of their own so
// one load has everything the grid needs to render its headers — the same
// single-payload, local-first shape the rest of the tracker uses.
export interface TrackerData {
  vms: Vm[];
  deleted: Vm[];
  groups: VmGroup[];
}

// Fields a client may set when creating or editing a VM.
export type VmInput = Partial<
  Pick<
    Vm,
    | 'name'
    | 'oldIp'
    | 'newIp'
    | 'migrated'
    | 'isSupabase'
    | 'keep'
    | 'isClient'
    | 'expanded'
    | 'notes'
    | 'groupId'
  >
>;

// Fields a client may set when creating or renaming a group.
export type VmGroupInput = Partial<Pick<VmGroup, 'name' | 'notes'>>;

// Fields a client may set when creating or editing a URL row. `ipId` is here so
// a row can be pointed at whichever address serves it; null returns it to the
// VM's primary.
export type VmUrlInput = Partial<
  Pick<VmUrl, 'port' | 'proto' | 'url' | 'dns' | 'tested' | 'notes' | 'ipId'>
>;

// Fields a client may set when adding or editing one of a VM's extra addresses.
export type VmIpInput = Partial<
  Pick<VmIp, 'address' | 'label' | 'origin' | 'sourceVmId' | 'sourceVmName' | 'movedAt' | 'notes'>
>;

// Adding an address that came off another machine, as one action.
//
// Recording this by hand is three separate edits in three places — add the
// address here, repoint the URLs, trash the source — and doing two of the three
// leaves the tracker describing something that never happened. So it is one
// call: the address lands with its provenance, the source's own endpoints move
// onto it, and the source goes to the trash.
export interface VmIpMoveInput {
  // The VM the address is being taken from.
  sourceVmId: string;
  // The address itself. Defaults to the source's live address when omitted.
  address?: string;
  label?: string;
  movedAt?: string;
  notes?: string;
  // Bring the source's VM-owned endpoints onto the new address. On by default —
  // it is the reason the address moved at all.
  moveUrls?: boolean;
  // Send the source VM to the trash once its address has been taken. On by
  // default; trash rather than purge, so the move is reversible.
  trashSource?: boolean;
}

