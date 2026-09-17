import type { VmIpOrigin } from '@/types/common/vm';

// Raw `vm_ips` row as returned by Supabase (snake_case, DB column names).
//
// The **additional** addresses a VM answers on. The machine's primary address is
// still `vms.new_ip` — this table holds the extras, typically one adopted from a
// retired machine whose public IP was reattached here.
export interface VmIpRow {
  id: string;
  vm_id: string;
  address: string;
  label: string;
  origin: VmIpOrigin;
  // The VM this address was reattached from. Null once that VM is purged, which
  // is what `source_vm_name` is for.
  source_vm_id: string | null;
  source_vm_name: string;
  moved_at: string | null;
  position: number;
  notes: string;
  created_at: string;
  updated_at: string;
}
