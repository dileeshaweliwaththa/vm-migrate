// Raw `backup_targets` row as returned by Supabase (snake_case, DB column
// names). One row per database server we back up — MySQL or Postgres, per
// `engine` — holding what to connect to, where the dumps go and when it runs.
//
// The DB password and the Azure connection string are **not** here — they live in
// `backup_target_secrets`, which no client can read (see the migration).
export interface BackupTargetRow {
  id: string;
  name: string;
  // `backup_engine`: 'mysql' | 'postgres'. Left as a string here like every
  // other enum column — the service validates it against `BACKUP_ENGINES` on
  // the way into a domain type, so a value added to the DB enum before the app
  // knows about it degrades rather than crashes.
  engine: string;
  // The backup worker's address, e.g. `http://20.197.41.68:2999`.
  worker_url: string;
  db_host: string;
  db_port: number;
  db_user: string;
  // Legacy, superseded by `storage_id` → `backup_storage_accounts`.
  azure_account: string;
  azure_container: string;
  storage_id: string | null;
  blob_prefix: string;
  retention_days: number;
  // Present when selected with the `backup_storage_accounts(...)` embed.
  backup_storage_accounts?: { name: string; account_name: string; container: string } | null;
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
