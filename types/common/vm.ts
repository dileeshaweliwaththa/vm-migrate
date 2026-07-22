// Domain types for the VM Migration Tracker. These are the shapes the UI and
// hook layers work with: camelCase and real booleans. The service layer maps
// raw Supabase rows (snake_case) into these.

export const PROTOCOLS = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'WS', 'WSS'] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export interface VmUrl {
  id: string;
  vmId: string;
  port: string;
  proto: Protocol;
  url: string;
  dns: boolean;
  tested: boolean;
  notes: string;
  position: number;
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
  urls: VmUrl[];
}

// The full tracker payload: active VMs plus trashed (soft-deleted) VMs.
export interface TrackerData {
  vms: Vm[];
  deleted: Vm[];
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
  >
>;

// Fields a client may set when creating or editing a URL row.
export type VmUrlInput = Partial<
  Pick<VmUrl, 'port' | 'proto' | 'url' | 'dns' | 'tested' | 'notes'>
>;

export type TrashType = 'upview' | 'client';
