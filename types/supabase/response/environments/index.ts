import type { EnvironmentPortRow } from '@/types/supabase/response/environmentPorts';

export interface EnvironmentRow {
  id: string;
  project_id: string;
  name: string;
  cicd_provider: string;
  jenkins_url: string;
  jenkins_username: string;
  deploy_url: string;
  vm_id: string | null;
  notes: string;
  position: number;
  created_at: string;
  updated_at: string;
  // Nested selects used by the project-detail query.
  environment_ports?: EnvironmentPortRow[];
  // The IPs come along with the name because a record's direct URL is built from
  // the VM's address plus the record's port — see `vmLiveIp` in lib/endpoints.ts.
  vms?: { name: string; old_ip: string; new_ip: string; migrated: boolean } | null;
}
