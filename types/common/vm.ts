import type { VmJenkinsConfig } from '@/types/common/jenkins';

// Domain types for the VM Migration Tracker. These are the shapes the UI and
// hook layers work with: camelCase and real booleans. The service layer maps
// raw Supabase rows (snake_case) into these.

export const PROTOCOLS = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'WS', 'WSS'] as const;
export type Protocol = (typeof PROTOCOLS)[number];

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
}

// A purged VM whose URLs were migrated onto a destination VM is preserved here
// (stored as jsonb on the destination row) so the migrated endpoints survive.
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

// Fields a client may set when creating or editing a URL row.
export type VmUrlInput = Partial<
  Pick<VmUrl, 'port' | 'proto' | 'url' | 'dns' | 'tested' | 'notes'>
>;

export type TrashType = 'upview' | 'client';
