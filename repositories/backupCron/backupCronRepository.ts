import { createServiceClient } from '@/lib/supabase/service';

// Repository layer: the scheduled side of a backup, which lives in Postgres.
//
// Three RPCs, all `security definer` and all granted to `service_role` only —
// they read `cron.job`, `vault.decrypted_secrets` and `net._http_response`,
// none of which any client role can reach. So this module uses the service-role
// client, the same as the secrets repositories, and the role check that guards
// it is in the service layer.
//
// See `supabase/migrations/20260911170000_backup_cron_test.sql`.

// What Postgres knows about one target's job. Field names are the RPC's, which
// already speaks camelCase because it builds the JSON itself.
export interface BackupCronDiagnostics {
  jobName: string;
  scheduleEnabled: boolean;
  // The column's value.
  rowSchedule: string;
  jobExists: boolean;
  // What pg_cron will actually act on. Differs from `rowSchedule` only if a job
  // was left behind by a failed sync.
  jobSchedule: string;
  jobActive: boolean;
  // The URL the job posts to. Not a secret, and a wrong one (a `localhost` left
  // over from a laptop) is the most common reason a schedule never arrives.
  cronUrl: string;
  hasUrlSecret: boolean;
  hasTokenSecret: boolean;
  // The most recent firing, from `cron.job_run_details`. Empty when none.
  lastRunStatus: string;
  lastRunMessage: string;
  lastRunAt: string | null;
}

// One pg_net response. `settled` is false while the request is still in flight.
export interface BackupCronPingResult {
  settled: boolean;
  status: number;
  body: string;
  error: string;
  timedOut: boolean;
}

export const findBackupCronDiagnostics = async (
  targetId: string
): Promise<BackupCronDiagnostics> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('backup_cron_diagnostics', { p_target: targetId });
  if (error) throw new Error(error.message);
  return data as BackupCronDiagnostics;
};

// Posts a test request down the same path a firing job takes. Returns pg_net's
// request id; the response lands asynchronously and is read below.
export const sendBackupCronPing = async (): Promise<number> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('backup_cron_ping');
  if (error) throw new Error(error.message);
  return Number(data);
};

export const findBackupCronPingResult = async (
  requestId: number
): Promise<BackupCronPingResult> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('backup_cron_ping_result', { p_request: requestId });
  if (error) throw new Error(error.message);
  return data as BackupCronPingResult;
};
