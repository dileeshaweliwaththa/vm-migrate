// Domain types for the Backups feature. camelCase; the service layer maps both
// snake_case Supabase rows (the target, its schedule, the dispatch audit) and the
// backup worker's own JSON (status, databases, history) into these.

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

// An Azure destination, shared by every target that writes to it — so the
// account key is entered once and rotated once.
//
// Secret-free: `hasConnectionString` is a boolean. The connection string holds
// the account key and never reaches a browser.
export interface BackupStorageAccount {
  id: string;
  name: string;
  accountName: string;
  container: string;
  notes: string;
  hasConnectionString: boolean;
}

export type BackupStorageInput = Partial<
  Pick<BackupStorageAccount, 'name' | 'accountName' | 'container' | 'notes'>
> & {
  // Blank means "keep what is stored".
  connectionString?: string;
};

// A MySQL server we back up: what to connect to, where the dumps go, and when.
//
// Secret-free by construction. The database password is stored server-side only
// and never reaches a browser — `hasDbPassword` is a boolean, which is all the
// UI needs to say "stored". The Azure key belongs to the destination
// (`BackupStorageAccount`), held the same way.
export interface BackupTarget {
  id: string;
  name: string;
  // Legacy: the external worker this feature used before the app performed its
  // own dumps. Still read so an older deployment's row is not silently lost;
  // nothing writes it and no form asks for it. See docs/backups.md.
  workerUrl: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  // The chosen destination. `storageName` and `storageContainer` are joined on
  // for display; null when a destination was removed from under this target.
  storageId: string | null;
  storageName: string;
  storageContainer: string;
  // The target's own folder inside the container. Derived from the name once, at
  // creation, and then fixed: retention deletes by age *within* this prefix, so
  // changing it would orphan everything already written under the old one.
  blobPrefix: string;
  retentionDays: number;
  // Standard five-field cron. Handed to pg_cron unchanged, so this *is* the
  // schedule rather than a description of one running somewhere else.
  cronSchedule: string;
  scheduleEnabled: boolean;
  notes: string;
  position: number;
  hasDbPassword: boolean;
}

// A write. The two secrets are optional and blank means "keep what is stored":
// the form is never sent them, so it has nothing to send back.
export type BackupTargetInput = Partial<
  Pick<
    BackupTarget,
    | 'name'
    | 'dbHost'
    | 'dbPort'
    | 'dbUser'
    | 'storageId'
    | 'retentionDays'
    | 'cronSchedule'
    | 'scheduleEnabled'
    | 'notes'
    | 'position'
  >
> & {
  // Blank means "keep the stored password".
  dbPassword?: string;
};

// One dump attempt — a `backup_runs` row.
//
// There is no "uploaded to Azure" flag any more: the dump *is* the upload. The
// app streams `mysqldump` straight into a blob, so a run that succeeded is in
// Azure by definition and one that failed left nothing behind. The old worker
// wrote a local file first, which is what made "succeeded but never uploaded" a
// state worth tracking.
export interface BackupRecord {
  id: string;
  database: string;
  // The blob name in the container, which is this dump's identity:
  // `<database>/<database>_<timestamp>.sql.gz`.
  blobName: string;
  // Bytes uploaded. Formatting belongs to the UI.
  size: number;
  // Milliseconds.
  duration: number;
  timestamp: string;
  status: BackupStatus;
  error: string;
  trigger: BackupTrigger;
  // Groups the dumps of one triggering — 18 databases at 02:00 is one batch.
  batchId: string;
}

// Whether this target can actually be backed up right now, established by
// asking the database server for its list of databases — the same call the
// runner makes, so "reachable" means reachable *for a backup*, not just
// pingable.
export interface BackupTargetStatus {
  reachable: boolean;
  // Why not, when not: a refused connection, a rejected password, a missing
  // `mysqldump`, or a credential this target hasn't been given.
  error: string;
  host: string;
  port: number;
  // A run is in flight for this target (an unfinished `backup_runs` row).
  isBackupRunning: boolean;
  // A destination is selected and its connection string is on file, so a run has
  // somewhere to put its output.
  azureConfigured: boolean;
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

// One step of a run — a `backup_run_events` row.
//
// The runner writes these as it goes, so unlike the worker's in-memory stream
// they survive a reload, a different browser, and a run nobody was watching.
// They carry their own message and timestamp, because we wrote them.
export interface BackupLogEvent {
  // The row id: monotonic, and what `since` pages on.
  seq: number;
  // 'start' | 'db_dump' | 'db_done' | 'db_error' | 'retention' | 'complete'.
  type: string;
  database: string;
  message: string;
  timestamp: string;
}

export interface BackupLogPage {
  // The batch these lines belong to — one triggering of the backup.
  batchId: string;
  isRunning: boolean;
  events: BackupLogEvent[];
}

// Everything the page needs for one target in one request.
export interface BackupTargetOverview {
  target: BackupTarget;
  status: BackupTargetStatus;
  databases: string[];
  records: BackupRecord[];
  // The last time a run was asked for, from either source. Null when none has
  // been — which for an enabled schedule is itself the finding.
  lastDispatch: BackupDispatch | null;
}
