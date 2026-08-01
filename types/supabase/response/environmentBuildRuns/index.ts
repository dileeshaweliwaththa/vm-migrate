// A row of `environment_build_runs` — one triggered Jenkins build, who started
// it, and how it ended. See docs/jenkins-sync.md.
export interface EnvironmentBuildRunRow {
  id: string;
  environment_id: string;
  port_id: string | null;
  job_url: string;
  job_name: string;
  queue_url: string;
  build_url: string;
  build_number: number | null;
  phase: string;
  result: string | null;
  triggered_by: string | null;
  triggered_by_email: string;
  triggered_by_name: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}
