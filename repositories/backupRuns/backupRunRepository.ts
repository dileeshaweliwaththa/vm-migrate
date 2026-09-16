import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

// Repository layer: `backup_runs` and `backup_run_events` — the record of what
// the app's own backup runner did.
//
// **Writes go through the service-role client.** A scheduled run has no session
// to write as, and the tables carry read-only policies for exactly that reason:
// nothing but the runner may write them, so there is no policy a client could
// satisfy. Reads use the request-scoped client, so RLS still decides who sees
// them.

export interface BackupRunRow {
  id: string;
  target_id: string;
  batch_id: string;
  database_name: string;
  blob_name: string;
  size_bytes: number;
  duration_ms: number;
  status: string;
  error: string;
  source: string;
  requested_by: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface BackupRunEventRow {
  id: number;
  batch_id: string;
  target_id: string;
  type: string;
  database_name: string;
  message: string;
  created_at: string;
}

// ---- reads (request-scoped, RLS applies) -----------------------------------

export const findBackupRuns = async (
  targetId: string,
  limit = 500
): Promise<BackupRunRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_runs')
    .select('*')
    .eq('target_id', targetId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as BackupRunRow[];
};

// One row per target, from the `backup_run_stats` view: how many dumps it has,
// how many failed, the newest, and the newest still marked `running`.
//
// This is what the index cards are built from. Reading the rows themselves and
// counting them in Node cost 200 rows per target for three numbers, and grew
// with the history; a view costs one row per target forever.
export interface BackupRunStatsRow {
  target_id: string;
  total_runs: number;
  failed_runs: number;
  last_started_at: string | null;
  last_running_at: string | null;
}

// Every target's aggregates in one query — the index renders them all, so
// asking per target would be N round trips for N small rows.
export const findBackupRunStats = async (): Promise<BackupRunStatsRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('backup_run_stats').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as BackupRunStatsRow[];
};

// The same row for one target. A target with no runs yet has no row in the
// view, which is `null` here rather than an error — it means zero.
export const findBackupRunStatsFor = async (
  targetId: string
): Promise<BackupRunStatsRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_run_stats')
    .select('*')
    .eq('target_id', targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BackupRunStatsRow | null) ?? null;
};

// Just the blob names, for deciding which dumps in the container this app has no
// row for. The full rows are a hundred times the bytes for a set membership
// test.
export const findBackupRunBlobNames = async (targetId: string): Promise<string[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('backup_runs')
    .select('blob_name')
    .eq('target_id', targetId)
    .not('blob_name', 'is', null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { blob_name: string }[]).map((row) => row.blob_name).filter(Boolean);
};

export const findBackupRunById = async (id: string): Promise<BackupRunRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('backup_runs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BackupRunRow | null) ?? null;
};

// The newest batch for a target, and the lines it has produced so far — which is
// what the log panel shows, whether or not this browser started the run.
export const findLatestBatchEvents = async (
  targetId: string,
  since = 0
): Promise<BackupRunEventRow[]> => {
  const supabase = await createClient();
  const { data: latest, error: latestError } = await supabase
    .from('backup_run_events')
    .select('batch_id')
    .eq('target_id', targetId)
    .order('id', { ascending: false })
    .limit(1);
  if (latestError) throw new Error(latestError.message);

  const batchId = latest?.[0]?.batch_id as string | undefined;
  if (!batchId) return [];

  const { data, error } = await supabase
    .from('backup_run_events')
    .select('*')
    .eq('batch_id', batchId)
    .gt('id', since)
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BackupRunEventRow[];
};

// Is a run already in flight for this target? A crashed container would leave a
// `running` row behind forever, so a row older than the cutoff does not count as
// live — the caller decides the window.
export const countRunningBackups = async (
  targetId: string,
  staleBefore: string
): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('backup_runs')
    .select('id', { count: 'exact', head: true })
    .eq('target_id', targetId)
    .eq('status', 'running')
    .gt('started_at', staleBefore);
  if (error) throw new Error(error.message);
  return count ?? 0;
};

// The same count for the runner, **service-role**. A scheduled run reads it
// without a session, and under RLS it would come back 0 however many runs were
// in flight — turning "one run per target" into no limit at all on the one path
// that fires unattended.
export const countRunningBackupsAsService = async (
  targetId: string,
  staleBefore: string
): Promise<number> => {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from('backup_runs')
    .select('id', { count: 'exact', head: true })
    .eq('target_id', targetId)
    .eq('status', 'running')
    .gt('started_at', staleBefore);
  if (error) throw new Error(error.message);
  return count ?? 0;
};

// ---- writes (service-role; the runner only) --------------------------------

export const insertBackupRun = async (values: {
  target_id: string;
  batch_id: string;
  database_name: string;
  blob_name: string;
  source: string;
  requested_by: string | null;
}): Promise<string> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('backup_runs')
    .insert({ ...values, status: 'running' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
};

export const finishBackupRun = async (
  id: string,
  values: {
    status: 'success' | 'failed';
    size_bytes?: number;
    duration_ms: number;
    error?: string;
  }
): Promise<void> => {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('backup_runs')
    .update({ ...values, finished_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const insertBackupRunEvent = async (values: {
  batch_id: string;
  target_id: string;
  type: string;
  database_name?: string;
  message: string;
}): Promise<void> => {
  const supabase = createServiceClient();
  // Deliberately not awaited by the runner's hot path and deliberately not
  // fatal: losing a progress line must never abort a backup that is working.
  // (The old worker made the same call and the same trade-off.)
  const { error } = await supabase.from('backup_run_events').insert(values);
  if (error) console.warn('[backups] could not record a progress line:', error.message);
};
