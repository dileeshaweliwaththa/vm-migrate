import type { EnvironmentPortRow } from '@/types/supabase/response/environmentPorts';

export interface EnvironmentRow {
  id: string;
  project_id: string;
  name: string;
  cicd_provider: string;
  jenkins_url: string;
  deploy_url: string;
  vm_id: string | null;
  notes: string;
  position: number;
  created_at: string;
  updated_at: string;
  // Nested selects used by the project-detail query.
  environment_ports?: EnvironmentPortRow[];
  vms?: { name: string } | null;
}
