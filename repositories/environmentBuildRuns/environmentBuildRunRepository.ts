import { createClient } from '@/lib/supabase/server';
import type { EnvironmentBuildRunRow } from '@/types/supabase/response/environmentBuildRuns';

// Repository layer: pure Supabase data access for `environment_build_runs` — the
// audit trail of triggered Jenkins builds. Writes go through the caller's own
// session, so RLS ties every row to the user who started the build.

export type BuildRunWriteColumns = Partial<{
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
}>;

export const insertBuildRun = async (
  values: BuildRunWriteColumns
): Promise<EnvironmentBuildRunRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('environment_build_runs')
    .insert(values)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EnvironmentBuildRunRow;
};

// Updates the run identified by whichever handle the poller currently holds — the
// queue URL before an executor picks the build up, the build URL afterwards.
export const updateBuildRunByRef = async (
  match: { queue_url: string } | { build_url: string },
  values: BuildRunWriteColumns
): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('environment_build_runs').update(values).match(match);
  if (error) throw new Error(error.message);
};

// Newest-first runs across **every** environment — what the dashboard summary
// reads. `since` (an ISO timestamp) bounds it to a window so the caller can both
// aggregate the period and slice a short feed off the front of the same result,
// without a second query. Read-only for any signed-in role, same as the
// per-environment history.
export const findRecentBuildRuns = async (
  limit: number,
  since?: string
): Promise<EnvironmentBuildRunRow[]> => {
  const supabase = await createClient();
  const query = supabase.from('environment_build_runs').select('*');
  if (since) query.gte('created_at', since);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvironmentBuildRunRow[];
};

// Newest-first runs of an environment, or of a single record within it when
// `portId` is given (the per-record history).
export const findBuildRuns = async (
  environmentId: string,
  limit: number,
  portId?: string
): Promise<EnvironmentBuildRunRow[]> => {
  const supabase = await createClient();
  const query = supabase
    .from('environment_build_runs')
    .select('*')
    .eq('environment_id', environmentId);
  if (portId) query.eq('port_id', portId);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvironmentBuildRunRow[];
};
