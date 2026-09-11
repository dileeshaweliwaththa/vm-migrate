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
