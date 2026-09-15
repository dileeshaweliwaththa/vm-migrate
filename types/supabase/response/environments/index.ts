import type { EndpointRow } from '@/types/supabase/response/endpoints';
import type { VmSummaryRow } from '@/types/supabase/response/vms';

export interface EnvironmentRow {
  id: string;
  project_id: string;
  // The stage — one of the `environment_name` enum's three values.
  name: string;
  // The optional display name that distinguishes two environments sharing a
  // stage ("CSE UAT"). Empty for the single-DEV case, which is most of them.
  label: string;
  cicd_provider: string;
  jenkins_url: string;
  jenkins_username: string;
  deploy_url: string;
  vm_id: string | null;
  notes: string;
  position: number;
  created_at: string;
  updated_at: string;
  // Nested selects used by the project-detail query. `endpoints` is the one URL
  // table (it was `environment_ports` before the tables were unified); a row
  // embedded here is always one of this environment's records.
  endpoints?: EndpointRow[];
  // The IPs come along with the name because a record's direct URL is built from
  // the VM's address plus the record's port — see `vmLiveIp` in lib/endpoints.ts.
  vms?: VmSummaryRow | null;
}
