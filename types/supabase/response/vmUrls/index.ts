// Raw `vm_urls` row as returned by Supabase (snake_case, DB column names).
export interface VmUrlRow {
  id: string;
  vm_id: string;
  port: string;
  proto: string;
  url: string;
  dns: boolean;
  tested: boolean;
  notes: string;
  position: number;
  created_at: string;
  updated_at: string;
}
