// Raw `vm_groups` row as returned by Supabase (snake_case, DB column names).
// One group, many `vms` — the VM side carries the FK (`vms.group_id`).
export interface VmGroupRow {
  id: string;
  name: string;
  notes: string;
  created_at: string;
  updated_at: string;
}
