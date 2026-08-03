import type { EnvironmentBuildRunRow } from '@/types/supabase/response/environmentBuildRuns';
import type {
  EnvironmentBuildRun,
  JenkinsBuildStatus,
  JenkinsRunPhase,
} from '@/types/common/jenkins';

// Shared row -> domain mapper for the Jenkins slice, in its own module (mirroring
// services/projects/mappers.ts) so the dashboard summary can map build-run rows
// without importing the whole jenkinsService — which pulls in the Jenkins HTTP
// repository and the secrets store it has no use for.

export const rowToBuildRun = (row: EnvironmentBuildRunRow): EnvironmentBuildRun => ({
  id: row.id,
  environmentId: row.environment_id,
  portId: row.port_id,
  jobName: row.job_name,
  jobUrl: row.job_url,
  buildNumber: row.build_number,
  buildUrl: row.build_url,
  phase: row.phase as JenkinsRunPhase,
  result: (row.result as JenkinsBuildStatus | null) ?? null,
  triggeredBy: row.triggered_by,
  // Snapshotted at trigger time — see the migration for why this isn't a join.
  triggeredByLabel: row.triggered_by_name || row.triggered_by_email || 'Unknown user',
  startedAt: row.created_at,
  finishedAt: row.finished_at,
});
