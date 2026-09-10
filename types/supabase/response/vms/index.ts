import type { MigratedArchiveEntry } from '@/types/common/vm';

// Raw `vms` row as returned by Supabase (snake_case, DB column names).
export interface VmRow {
  id: string;
  name: string;
  old_ip: string;
  new_ip: string;
  migrated: boolean;
  is_supabase: boolean;
  keep: boolean;
  is_client: boolean;
  expanded: boolean;
  notes: string;
  // jsonb column; stored in the domain (camelCase) shape.
  migrated_archive: MigratedArchiveEntry[];
  deleted: boolean;
  deleted_at: string | null;
  // FK -> vm_groups.id, `on delete set null`. Null for an ungrouped VM.
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

// The slice of a `vms` row that other tables embed when they join to it: enough
// to name the VM and resolve its live address (see `vmLiveIp`), nothing more.
// Shared so the environments and projects selects can't drift apart.
export interface VmSummaryRow {
  name: string;
  old_ip: string;
  new_ip: string;
  migrated: boolean;
}
