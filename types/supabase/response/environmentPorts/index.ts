export interface EnvironmentPortRow {
  id: string;
  environment_id: string;
  port: string;
  // The deployed branch, for managed-platform records that have no port.
  branch: string;
  protocol: string;
  description: string;
  domain: string;
  source: string;
  jenkins_job_url: string;
  position: number;
  created_at: string;
  updated_at: string;
}
