export interface EnvironmentPortRow {
  id: string;
  environment_id: string;
  port: string;
  protocol: string;
  description: string;
  domain: string;
  source: string;
  jenkins_job_url: string;
  position: number;
  created_at: string;
  updated_at: string;
}
