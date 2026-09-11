import {
  countBackupTargets,
  deleteBackupTarget as deleteBackupTargetRow,
  findAllBackupTargets,
  findBackupTargetById,
  findRecentBackupDispatches,
  insertBackupDispatch,
  insertBackupTarget,
  updateBackupTarget as updateBackupTargetRow,
  type BackupTargetWriteColumns,
} from '@/repositories/backupTargets/backupTargetRepository';
import {
  findBackupTargetSecretFlags,
  setBackupTargetSecrets,
} from '@/repositories/backupTargets/backupTargetSecretRepository';
import {
  countRunningBackups,
  findBackupRunById,
  findBackupRuns,
  findLatestBatchEvents,
  type BackupRunRow,
} from '@/repositories/backupRuns/backupRunRepository';
import {
  deleteBlob,
  downloadBlob,
  listBlobs,
  type BlobSummary,
} from '@/repositories/azure/azureBlobRepository';
import { getAuthenticatedUser } from '@/repositories/auth/authRepository';
import { getCurrentRole } from '@/services/auth/authService';
import { listTargetDatabases, startBackup } from '@/services/backups/backupRunner';
import { getStorageForWrite } from '@/services/backups/backupStorageService';
import { isAdmin } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import type { BackupDispatchRow, BackupTargetRow } from '@/types/supabase/response/backupTargets';
import {
  BACKUP_DISPATCH_SOURCES,
  BACKUP_DISPATCH_STATUSES,
  BACKUP_STATUSES,
  type BackupDispatch,
  type BackupDispatchSource,
  type BackupDispatchStatus,
  type BackupLogPage,
  type BackupRecord,
  type BackupStatus,
  type BackupTarget,
  type BackupTargetInput,
  type BackupTargetOverview,
  type BackupTargetStatus,
} from '@/types/common/backup';

// Service layer: database backups.
//
// Everything about a backup now lives in this app and in Supabase:
//
//   * configuration + credentials → `backup_targets` / `backup_target_secrets`
//   * the schedule                → pg_cron, calling this app's own route
//   * the dump                    → `backupRunner`, streaming into Azure Blob
//   * the history and the log     → `backup_runs` / `backup_run_events`
//
// There is no worker container in the path any more, so there is nothing to be
// unreachable, out of step with this configuration, or holding a copy of a dump
// on a local disk.
//
// This module owns the rules — who may press what — and the mapping. The runner
// owns the work; the repositories own the I/O.

// ---- authorization ---------------------------------------------------------

// **Backups are admin-write, everyone-read.** Every other feature here splits
// at editor, but a backup target holds a database superuser's password, its
// dumps are the whole contents of every database on the server, and its schedule
// decides whether any of it happens. There is no action on this tab that is
// merely "editing a record", so there is one gate rather than two.
//
// Reading is unrestricted: any signed-in user sees the targets, their databases,
// the history and the logs. Knowing that last night's backup ran is not a
// privilege, and hiding it from the people who would notice it stopped would be
// the wrong way round.
const requireAdmin = async (action: string): Promise<void> => {
  if (!isAdmin(await getCurrentRole())) {
    throw new ForbiddenError(`Admin access required to ${action}.`);
  }
};

// A `running` row older than this is a run whose container died, not a run in
// progress — the same window the runner uses to decide whether it may start.
const STALE_RUN_MS = 3 * 60 * 60 * 1000;
const staleCutoff = () => new Date(Date.now() - STALE_RUN_MS).toISOString();

// ---- mapping ---------------------------------------------------------------

const rowToTarget = (
  row: BackupTargetRow,
  flags?: { hasDbPassword: boolean; hasAzureConnection: boolean }
): BackupTarget => ({
  id: row.id,
  name: row.name,
  workerUrl: row.worker_url,
  dbHost: row.db_host,
  dbPort: row.db_port,
  dbUser: row.db_user,
  storageId: row.storage_id,
  storageName: row.backup_storage_accounts?.name ?? '',
  storageContainer: row.backup_storage_accounts?.container ?? '',
  blobPrefix: row.blob_prefix,
  retentionDays: row.retention_days,
  cronSchedule: row.cron_schedule,
  scheduleEnabled: row.schedule_enabled,
  notes: row.notes,
  position: row.position,
  hasDbPassword: flags?.hasDbPassword ?? false,
});

const rowToDispatch = (row: BackupDispatchRow): BackupDispatch => {
  const source = row.source as BackupDispatchSource;
  const status = row.status as BackupDispatchStatus;
  return {
    id: row.id,
    targetId: row.target_id,
    source: BACKUP_DISPATCH_SOURCES.includes(source) ? source : 'schedule',
    status: BACKUP_DISPATCH_STATUSES.includes(status) ? status : 'failed',
    httpStatus: row.http_status,
    error: row.error,
    createdAt: row.created_at,
  };
};

const rowToRecord = (row: BackupRunRow): BackupRecord => {
  const status = row.status as BackupStatus;
  return {
    id: row.id,
    database: row.database_name,
    blobName: row.blob_name,
    size: Number(row.size_bytes ?? 0),
    duration: row.duration_ms,
    timestamp: row.started_at,
    status: BACKUP_STATUSES.includes(status) ? status : 'failed',
    error: row.error,
    // The dispatch vocabulary is `schedule`/`manual`; the history column has
    // always said `auto`/`manual`.
    trigger: row.source === 'schedule' ? 'auto' : 'manual',
    batchId: row.batch_id,
  };
};

// ---- the dumps Azure has that we have no row for ---------------------------

// **The container is the truth about which backups exist.** A `backup_runs` row
// records how a run went — who asked, how long it took, why it failed — but it
// only exists for runs *this app* performed. Every dump taken before that (by
// the worker this feature replaced) is still in Azure, and a history that
// ignored them would report zero backups for a database with months of them.
//
// So history is the union: the run rows, plus every blob no row accounts for.
const BLOB_RECORD_PREFIX = 'blob_';

// A run's id is a UUID; a blob's is its path, which contains slashes. Record ids
// are interpolated into a route path (`/records/:recordId/download`), so a raw
// path would split into several segments and match nothing — hence base64url,
// which keeps the id one opaque segment needing no escaping.
const encodeBlobId = (name: string): string =>
  `${BLOB_RECORD_PREFIX}${Buffer.from(name, 'utf8').toString('base64url')}`;

const decodeBlobId = (id: string): string =>
  Buffer.from(id.slice(BLOB_RECORD_PREFIX.length), 'base64url').toString('utf8');

// What a blob can tell us is its path, its size and when it was written. The
// rest is honestly absent rather than invented — `duration: 0` renders as "—".
const blobToRecord = (blob: BlobSummary): BackupRecord => {
  const segments = blob.name.split('/');
  return {
    // Prefixed so the download and delete paths can tell the two kinds of record
    // apart: one id is a row, this one is an encoded blob path.
    id: encodeBlobId(blob.name),
    // `<prefix>/<database>/<file>`, or the older `<database>/<file>` — either
    // way the database is the second-to-last segment.
    database: segments.length >= 2 ? segments[segments.length - 2] : '',
    blobName: blob.name,
    size: blob.size,
    duration: 0,
    timestamp: blob.createdAt,
    // The blob exists, so the dump was written. A failed dump leaves none.
    status: 'success',
    error: '',
    // Unknowable from a blob, and these are overwhelmingly scheduled runs.
    trigger: 'auto',
    batchId: '',
  };
};

// Which blobs in a shared container belong to this target.
//
// Two layouts coexist. This app writes `<target prefix>/<database>/<file>`, so
// those attribute exactly. The older flat `<database>/<file>` has nothing to
// attribute by, so it is claimed only when exactly one target still carries the
// legacy `azure_container` for that container — with two candidates, showing
// them under neither is better than showing them under the wrong server.
const blobBelongsToTarget = (
  blobName: string,
  target: BackupTargetRow,
  siblings: BackupTargetRow[],
  container: string
): boolean => {
  const segments = blobName.split('/');
  if (segments.length >= 3) {
    return Boolean(target.blob_prefix) && segments[0] === target.blob_prefix;
  }
  if (segments.length === 2) {
    const legacy = siblings.filter(
      (row) => row.azure_container === container && row.storage_id === target.storage_id
    );
    return legacy.length === 1 && legacy[0].id === target.id;
  }
  // A blob at the container root belongs to no database folder.
  return false;
};

// Lists each distinct destination **once**, however many targets share it: the
// index page renders every target, and they all point at the same container.
const listBlobsPerStorage = async (
  rows: BackupTargetRow[]
): Promise<Map<string, { container: string; blobs: BlobSummary[] }>> => {
  const ids = [...new Set(rows.map((row) => row.storage_id).filter((id): id is string => !!id))];

  const entries = await Promise.all(
    ids.map(async (id) => {
      const storage = await getStorageForWrite(id);
      if (!storage.ok) return null;
      try {
        const blobs = await listBlobs(storage.connectionString, storage.container);
        return [id, { container: storage.container, blobs }] as const;
      } catch {
        // Azure being unreachable costs us the older dumps, not the page — the
        // run rows are still a complete record of what this app did.
        return null;
      }
    })
  );

  return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
};

// A target's history: its run rows, plus the blobs those rows don't cover.
const collectRecords = (
  target: BackupTargetRow,
  siblings: BackupTargetRow[],
  runs: BackupRunRow[],
  listed: Map<string, { container: string; blobs: BlobSummary[] }>
): BackupRecord[] => {
  const records = runs.map(rowToRecord);

  const found = target.storage_id ? listed.get(target.storage_id) : undefined;
  if (!found) return records;

  const accountedFor = new Set(runs.map((run) => run.blob_name).filter(Boolean));
  const fromBlobs = found.blobs
    .filter(
      (blob) =>
        !accountedFor.has(blob.name) &&
        blobBelongsToTarget(blob.name, target, siblings, found.container)
    )
    .map(blobToRecord);

  // Newest first, which is the order every consumer of this list wants.
  return [...records, ...fromBlobs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};

// ---- the registry ----------------------------------------------------------

const inputToColumns = (input: BackupTargetInput): BackupTargetWriteColumns => {
  const cols: BackupTargetWriteColumns = {};
  if (input.name !== undefined) cols.name = input.name.trim();
  if (input.dbHost !== undefined) cols.db_host = input.dbHost.trim();
  if (input.dbPort !== undefined) cols.db_port = input.dbPort;
  if (input.dbUser !== undefined) cols.db_user = input.dbUser.trim();
  // Null is meaningful (no destination), so this tests for `undefined`.
  if (input.storageId !== undefined) cols.storage_id = input.storageId;
  if (input.retentionDays !== undefined) cols.retention_days = input.retentionDays;
  if (input.cronSchedule !== undefined) cols.cron_schedule = input.cronSchedule.trim();
  if (input.scheduleEnabled !== undefined) cols.schedule_enabled = input.scheduleEnabled;
  if (input.notes !== undefined) cols.notes = input.notes;
  if (input.position !== undefined) cols.position = input.position;
  return cols;
};

// A five-field cron expression, which is what pg_cron takes. Checked here
// because the alternative is `cron.schedule` throwing inside the trigger and
// failing the whole write with a Postgres message.
const isCronExpression = (value: string): boolean => value.trim().split(/\s+/).length === 5;

// A target's folder inside the shared container. Kept to characters that are
// unambiguous in a blob path.
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'target';

const assertWritable = (cols: BackupTargetWriteColumns): void => {
  if (cols.db_host !== undefined && !cols.db_host) {
    throw new Error('The database host is required.');
  }
  if (
    cols.cron_schedule !== undefined &&
    cols.cron_schedule &&
    !isCronExpression(cols.cron_schedule)
  ) {
    throw new Error('The schedule must be a five-field cron expression, e.g. 0 2 * * *.');
  }
  if (cols.db_port !== undefined && (cols.db_port < 1 || cols.db_port > 65535)) {
    throw new Error('The database port must be between 1 and 65535.');
  }
  if (cols.retention_days !== undefined && cols.retention_days < 1) {
    throw new Error('Retention must be at least one day.');
  }
};

export const listBackupTargets = async (): Promise<BackupTarget[]> => {
  const rows = await findAllBackupTargets();
  const flags = await findBackupTargetSecretFlags(rows.map((row) => row.id));
  return rows.map((row) => rowToTarget(row, flags.get(row.id)));
};

export const createBackupTarget = async (input: BackupTargetInput): Promise<BackupTarget> => {
  await requireAdmin('add a backup target');

  const cols = inputToColumns(input);
  if (!cols.db_host) throw new Error('The database host is required.');
  assertWritable(cols);
  if (!cols.name) cols.name = cols.db_host;
  // Derived once, here, and never rewritten: retention deletes by age within
  // this prefix, so changing it later would orphan everything under the old one.
  cols.blob_prefix = slugify(cols.name);
  if (cols.position === undefined) cols.position = await countBackupTargets();

  const row = await insertBackupTarget(cols);
  await setBackupTargetSecrets(row.id, { dbPassword: input.dbPassword });

  const flags = await findBackupTargetSecretFlags([row.id]);
  return rowToTarget(row, flags.get(row.id));
};

export const updateBackupTarget = async (
  id: string,
  input: BackupTargetInput
): Promise<BackupTarget> => {
  await requireAdmin('edit a backup target');

  const cols = inputToColumns(input);
  assertWritable(cols);

  const row = await updateBackupTargetRow(id, cols);
  // Blank means "keep the stored one": the form is never sent a credential, so
  // an empty field cannot mean "clear it".
  await setBackupTargetSecrets(id, {
    dbPassword: input.dbPassword?.trim() ? input.dbPassword : undefined,
  });

  const flags = await findBackupTargetSecretFlags([id]);
  return rowToTarget(row, flags.get(id));
};

// Removes the target, its credentials (cascade), its history rows (cascade) and
// its pg_cron job (the trigger). **The dumps in Azure are not touched** — they
// are the backups, and losing the record of them must not lose them.
export const deleteBackupTarget = async (id: string): Promise<void> => {
  await requireAdmin('remove a backup target');
  await deleteBackupTargetRow(id);
};

// ---- reading ---------------------------------------------------------------

// Can this target be backed up right now?
//
// Answered by asking the server for its databases — the same call the runner
// makes — so "reachable" means reachable *for a backup*: the host resolves, the
// password works, and `mysqldump` exists in this image. A cheaper ping would
// report a health this feature cannot act on.
const resolveStatus = async (
  target: BackupTarget,
  isRunning: boolean
): Promise<{ status: BackupTargetStatus; databases: string[] }> => {
  // "Configured" means a destination is selected *and* its connection string is
  // stored — a target pointing at an account nobody gave a key to has nowhere to
  // write, which is the same problem as having no destination at all.
  const storage = await getStorageForWrite(target.storageId);
  const base = {
    host: target.dbHost,
    port: target.dbPort,
    isBackupRunning: isRunning,
    azureConfigured: storage.ok,
    azureContainer: storage.ok ? storage.container : target.storageContainer,
  };

  if (!target.dbHost.trim() || !target.hasDbPassword) {
    return {
      status: {
        ...base,
        reachable: false,
        error: !target.dbHost.trim()
          ? 'No database host is set for this target.'
          : 'No database password is stored for this target.',
      },
      databases: [],
    };
  }

  const result = await listTargetDatabases(target.id);
  return {
    status: {
      ...base,
      reachable: result.ok,
      error: result.ok ? '' : (result.error ?? 'The database could not be reached.'),
    },
    databases: result.databases,
  };
};

export const getBackupTargetOverview = async (id: string): Promise<BackupTargetOverview> => {
  const row = await findBackupTargetById(id);
  if (!row) throw new Error('Backup target not found.');

  const flags = await findBackupTargetSecretFlags([id]);
  const target = rowToTarget(row, flags.get(id));

  const [runs, dispatches, running, siblings, listed] = await Promise.all([
    findBackupRuns(id),
    findRecentBackupDispatches(50),
    countRunningBackups(id, staleCutoff()),
    // Both are needed to attribute the pre-unification blobs, which carry no
    // target prefix in their path.
    findAllBackupTargets(),
    listBlobsPerStorage([row]),
  ]);

  const { status, databases } = await resolveStatus(target, running > 0);

  return {
    target,
    status,
    databases,
    records: collectRecords(row, siblings, runs, listed),
    lastDispatch:
      dispatches.map(rowToDispatch).find((dispatch) => dispatch.targetId === id) ?? null,
  };
};

export const listBackupTargetOverviews = async (): Promise<BackupTargetOverview[]> => {
  const rows = await findAllBackupTargets();
  if (rows.length === 0) return [];

  const [flags, dispatches, listed] = await Promise.all([
    findBackupTargetSecretFlags(rows.map((row) => row.id)),
    findRecentBackupDispatches(200),
    listBlobsPerStorage(rows),
  ]);

  const latestByTarget = new Map<string, BackupDispatch>();
  for (const row of dispatches) {
    const dispatch = rowToDispatch(row);
    // Newest first from the query, so the first one seen per target wins.
    if (!latestByTarget.has(dispatch.targetId)) latestByTarget.set(dispatch.targetId, dispatch);
  }

  // In parallel: each target's status opens a connection to its database
  // server, and one slow host must not delay every other card.
  return Promise.all(
    rows.map(async (row) => {
      const target = rowToTarget(row, flags.get(row.id));
      const [runs, running] = await Promise.all([
        findBackupRuns(row.id, 200),
        countRunningBackups(row.id, staleCutoff()),
      ]);
      const { status, databases } = await resolveStatus(target, running > 0);

      return {
        target,
        status,
        databases,
        records: collectRecords(row, rows, runs, listed),
        lastDispatch: latestByTarget.get(row.id) ?? null,
      };
    })
  );
};

// The current (or most recent) run's progress lines. `since` is the last event
// id the client has, so the page asks for the tail.
export const getBackupLogs = async (id: string, since: number): Promise<BackupLogPage> => {
  const [events, running] = await Promise.all([
    findLatestBatchEvents(id, Math.max(0, since)),
    countRunningBackups(id, staleCutoff()),
  ]);

  return {
    batchId: events[0]?.batch_id ?? '',
    isRunning: running > 0,
    events: events.map((event) => ({
      seq: event.id,
      type: event.type,
      database: event.database_name,
      message: event.message,
      timestamp: event.created_at,
    })),
  };
};

// ---- acting ----------------------------------------------------------------

// Starts a run and returns as soon as it has begun — the dump itself takes
// minutes and is followed through the log, not through this response.
//
// The dispatch row records who asked. `source: 'schedule'` skips the role check
// because pg_cron has no session; that path is reachable only from the cron
// route, which authenticates with its own token.
export const runBackup = async (
  id: string,
  databases: string[],
  source: 'manual' | 'schedule' = 'manual'
): Promise<{ ok: boolean; message: string }> => {
  if (source === 'manual') await requireAdmin('run a backup');

  const user = source === 'manual' ? await getAuthenticatedUser() : null;
  const result = await startBackup(id, databases, source, user?.id ?? null);

  await insertBackupDispatch({
    target_id: id,
    source,
    status: result.ok ? 'dispatched' : 'failed',
    http_status: 0,
    error: result.ok ? '' : result.message,
    requested_by: user?.id ?? null,
  });

  return { ok: result.ok, message: result.message };
};

// Turns a history row's id into the blob it names, whichever kind it is: a
// `backup_runs` row this app wrote, or a blob that was in the container before
// it.
//
// Ownership is re-checked either way. A record id comes from the client, and
// without this check a crafted `blob:` id could name any blob in a shared
// container — including another target's dumps, which admins may delete.
const resolveRecordBlob = async (
  targetId: string,
  recordId: string
): Promise<
  | { ok: true; storage: { connectionString: string; container: string }; blobName: string }
  | { ok: false; message: string }
> => {
  const row = await findBackupTargetById(targetId);
  if (!row) return { ok: false, message: 'Backup target not found.' };

  const storage = await getStorageForWrite(row.storage_id);
  if (!storage.ok) return { ok: false, message: storage.message };

  if (recordId.startsWith(BLOB_RECORD_PREFIX)) {
    const blobName = decodeBlobId(recordId);
    const siblings = await findAllBackupTargets();
    if (!blobBelongsToTarget(blobName, row, siblings, storage.container)) {
      return { ok: false, message: 'That dump does not belong to this target.' };
    }
    return { ok: true, storage, blobName };
  }

  const run = await findBackupRunById(recordId);
  if (!run || run.target_id !== targetId) return { ok: false, message: 'Backup not found.' };
  if (run.status !== 'success' || !run.blob_name) {
    return { ok: false, message: 'That run produced no dump to download.' };
  }
  return { ok: true, storage, blobName: run.blob_name };
};

// Opens a dump for download, straight from Azure.
//
// The sharpest edge on the tab: everything else here is metadata *about* a
// backup, while this is the database contents — every row of every table, in one
// file, including whatever the application stores about people.
export const downloadBackup = async (
  id: string,
  recordId: string
): Promise<
  | {
      ok: true;
      stream: NodeJS.ReadableStream;
      size: number;
      contentType: string;
      filename: string;
    }
  | { ok: false; message: string }
> => {
  await requireAdmin('download a backup');

  const resolved = await resolveRecordBlob(id, recordId);
  if (!resolved.ok) return { ok: false, message: resolved.message };
  const { storage, blobName } = resolved;

  const blob = await downloadBlob(storage.connectionString, storage.container, blobName);
  if (!blob) {
    return {
      ok: false,
      message: 'That dump is no longer in Azure — it may have aged out of retention.',
    };
  }

  return {
    ok: true,
    stream: blob.stream,
    size: blob.size,
    contentType: blob.contentType,
    // The blob lives in a folder per database; the download is just the file.
    filename: blobName.split('/').pop() ?? 'backup.sql.gz',
  };
};

// Deletes the dump from Azure. Irreversible and admin-only — the one action here
// that can lose something you would want during an incident.
//
// The `backup_runs` row is kept: that a backup was taken, and then deleted, is
// history worth having.
export const deleteBackupRecord = async (
  id: string,
  recordId: string
): Promise<{ ok: boolean; message: string }> => {
  await requireAdmin('delete a backup');

  const resolved = await resolveRecordBlob(id, recordId);
  if (!resolved.ok) return { ok: false, message: resolved.message };

  await deleteBlob(resolved.storage.connectionString, resolved.storage.container, resolved.blobName);
  return { ok: true, message: 'Backup deleted from Azure.' };
};
