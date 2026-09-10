// Raw `backup_targets` row as returned by Supabase (snake_case, DB column
// names). One row per MySQL server we back up: what to connect to, where the
// dumps go, when it runs, and which worker does the dumping.
//
// The DB password and the Azure connection string are **not** here — they live in
// `backup_target_secrets`, which no client can read (see the migration).
export interface BackupTargetRow {
  id: string;
  name: string;
  // The backup worker's address, e.g. `http://20.197.41.68:2999`.
  worker_url: string;
  db_host: string;
  db_port: number;
  db_user: string;
  azure_account: string;
  azure_container: string;
  retention_days: number;
  // Standard five-field cron, handed to pg_cron as-is.
  cron_schedule: string;
  schedule_enabled: boolean;
  notes: string;
  position: number;
  created_at: string;
  updated_at: string;
}

// Raw `backup_dispatches` row: the record that a run was *asked for*. The
// outcome lives in the worker's own history.
export interface BackupDispatchRow {
  id: string;
  target_id: string;
  source: string;
  status: string;
  http_status: number;
  error: string;
  requested_by: string | null;
  created_at: string;
}
