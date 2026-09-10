// Raw `vm_jenkins` row as returned by Supabase (snake_case, DB column names).
// One row per VM — a VM runs one Jenkins, so the server is the machine's
// property. The API token is **not** here: it lives in `vm_jenkins_secrets`,
// which no client can read (see the migration).
export interface VmJenkinsRow {
  vm_id: string;
  base_url: string;
  username: string;
  created_at: string;
  updated_at: string;
}
