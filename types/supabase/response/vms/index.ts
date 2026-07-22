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
  created_at: string;
  updated_at: string;
}
