// Domain types for the Backups feature. camelCase; the service layer maps both
// snake_case Supabase rows (the target, its schedule, the dispatch audit) and the
// backup worker's own JSON (status, databases, history) into these.

// The default port a backup worker listens on — its `PORT`/`APP_PORT` env
// default. A target's worker address is therefore usually just the host.
export const BACKUP_WORKER_PORT = '2999';

// MySQL's default port, so the target form only asks when it differs.
export const DEFAULT_MYSQL_PORT = 3306;

// How a backup run was started. Mirrors the worker's `trigger_type`.
export const BACKUP_TRIGGERS = ['manual', 'auto'] as const;
export type BackupTrigger = (typeof BACKUP_TRIGGERS)[number];

// How a dump ended. Mirrors the worker's `status`.
export const BACKUP_STATUSES = ['success', 'failed', 'running'] as const;
export type BackupStatus = (typeof BACKUP_STATUSES)[number];

// Who asked for a run (mirrors the `backup_dispatch_source` DB enum).
export const BACKUP_DISPATCH_SOURCES = ['schedule', 'manual'] as const;
export type BackupDispatchSource = (typeof BACKUP_DISPATCH_SOURCES)[number];

// Whether the ask got through (mirrors `backup_dispatch_status`).
export const BACKUP_DISPATCH_STATUSES = ['dispatched', 'failed'] as const;
export type BackupDispatchStatus = (typeof BACKUP_DISPATCH_STATUSES)[number];

// A MySQL server we back up: what to connect to, where the dumps go, when, and
// which worker does the dumping.
//
// Secret-free by construction. The DB password and the Azure connection string
// are stored server-side only and never reach a browser — `hasDbPassword` and
// `hasAzureConnection` are booleans, which is all the UI needs to say "stored".
export interface BackupTarget {
  id: string;
  name: string;
  workerUrl: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  azureAccount: string;
  azureContainer: string;
  retentionDays: number;
  // Standard five-field cron. Handed to pg_cron unchanged, so this *is* the
  // schedule rather than a description of one running somewhere else.
  cronSchedule: string;
  scheduleEnabled: boolean;
  notes: string;
  position: number;
  hasDbPassword: boolean;
  hasAzureConnection: boolean;
}

// A write. The two secrets are optional and blank means "keep what is stored":
// the form is never sent them, so it has nothing to send back.
export type BackupTargetInput = Partial<
  Pick<
    BackupTarget,
    | 'name'
    | 'workerUrl'
    | 'dbHost'
    | 'dbPort'
    | 'dbUser'
    | 'azureAccount'
    | 'azureContainer'
    | 'retentionDays'
    | 'cronSchedule'
    | 'scheduleEnabled'
    | 'notes'
    | 'position'
  >
> & {
  dbPassword?: string;
  azureConnectionString?: string;
};

// One dump, as the worker's history reports it.
export interface BackupRecord {
  id: string;
  // The worker records one database per row, so this is that database.
  database: string;
  filename: string;
  // Bytes. Formatting belongs to the UI.
  size: number;
  // Milliseconds.
  duration: number;
  timestamp: string;
  status: BackupStatus;
  error: string;
  trigger: BackupTrigger;
  azureUploaded: boolean;
  azureUrl: string;
  azureError: string;
}

// A worker's live state, from `GET /api/status`.
export interface BackupWorkerStatus {
  // Whether *the portal* could reach the worker at all. False means everything
  // below is unknown rather than false — the difference the UI has to show.
  reachable: boolean;
  error: string;
  // The MySQL host the worker is configured against. Compared with the target's
  // own `dbHost`: a mismatch means the worker's `.env` and this row disagree.
  host: string;
  port: number;
  cronSchedule: string;
  // The worker's *own* node-cron. Now that Supabase schedules the runs, this
  // being on means two schedulers and two nightly runs.
  cronEnabled: boolean;
  isBackupRunning: boolean;
  azureEnabled: boolean;
  azureContainer: string;
}

// The record that a run was asked for. Pairs with the worker's history, which is
// the record of what happened.
export interface BackupDispatch {
  id: string;
  targetId: string;
  source: BackupDispatchSource;
  status: BackupDispatchStatus;
  httpStatus: number;
  error: string;
  createdAt: string;
}

// One step of a run, as the worker actually reports it.
//
// **There is no message and no timestamp.** The worker emits a structured
// `BackupProgress` — a type, the database, and whatever that step measured — and
// the sentences in its console are formatted from the type at print time. So the
// wording lives in `describeBackupEvent` (lib/backup-utils.ts) on this side too,
// and the clock is ours: `receivedAt` is stamped when the line arrives.
export interface BackupLogEvent {
  // Position in the run. The worker's own `seq` is not in the payload, so this is
  // the arrival order — which is what the list needs it for.
  seq: number;
  // 'start' | 'db_start' | 'db_dump' | 'db_compress' | 'db_upload' |
  // 'db_retention' | 'db_done' | 'db_error' | 'complete'. Left as a string: it is
  // another app's vocabulary, and an unrecognised value has to render as
  // something rather than crash the panel.
  type: string;
  database: string;
  // "3 of 18", when the step carries it.
  index: number;
  total: number;
  // Bytes, on the steps that have finished a dump.
  size: number;
  azureUploaded: boolean;
  azureError: string;
  error: string;
  // Local ISO time, stamped on arrival — see above.
  receivedAt: string;
}

export interface BackupLogPage {
  sessionId: string;
  isRunning: boolean;
  total: number;
  events: BackupLogEvent[];
}

// Everything the page needs for one target in one request.
export interface BackupTargetOverview {
  target: BackupTarget;
  status: BackupWorkerStatus;
  databases: string[];
  records: BackupRecord[];
  // The last time a run was asked for, from either source. Null when none has
  // been — which for an enabled schedule is itself the finding.
  lastDispatch: BackupDispatch | null;
}
