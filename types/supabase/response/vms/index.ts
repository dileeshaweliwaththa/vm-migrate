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
// to name the VM and resolve the address a record answers on, nothing more.
// Shared so the environments and projects selects can't drift apart — the select
// fragment that produces it is `VM_SUMMARY_EMBED` in the vm repository.
export interface VmSummaryRow {
  name: string;
  old_ip: string;
  new_ip: string;
  migrated: boolean;
  // The machine's **additional** addresses, so a record carrying `ip_id` can be
  // resolved to the address it actually answers on rather than to the machine's
  // primary. Absent on a select written before `vm_ips` existed, which resolves
  // every record to the primary — what they all meant then.
  vm_ips?: { id: string; address: string }[] | null;
}
