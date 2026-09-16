import {
  countBackupTargets,
  deleteBackupTarget as deleteBackupTargetRow,
  findAllBackupTargets,
  findAllBackupTargetsAsService,
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
  findBackupRunBlobNames,
  findBackupRunById,
  findBackupRuns,
  findBackupRunStats,
  findBackupRunStatsFor,
  findLatestBatchEvents,
  type BackupRunRow,
  type BackupRunStatsRow,
} from '@/repositories/backupRuns/backupRunRepository';
import {
  deleteBlob,
  downloadBlob,
  listBlobs,
  type BlobSummary,
} from '@/repositories/azure/azureBlobRepository';
import { getAuthenticatedUser } from '@/repositories/auth/authRepository';
import { getCurrentRole } from '@/services/auth/authService';
import {
  listTargetDatabases,
  startBackup,
  toBackupEngine,
} from '@/services/backups/backupRunner';
import { getStorageForWrite } from '@/services/backups/backupStorageService';
import { findStorageIdsWithSecret } from '@/repositories/backupStorage/backupStorageRepository';
import { isAdmin } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import type { BackupDispatchRow, BackupTargetRow } from '@/types/supabase/response/backupTargets';
import {
  BACKUP_ENGINES,
  BACKUP_ENGINE_DETAILS,
  BACKUP_DISPATCH_SOURCES,
  BACKUP_DISPATCH_STATUSES,
  BACKUP_STATUSES,
  type BackupDispatch,
  type BackupDispatchSource,
  type BackupEngine,
  type BackupDispatchStatus,
  type BackupLogPage,
  type BackupRecord,
  type BackupRunStats,
  type BackupStatus,
  type BackupTarget,
  type BackupTargetInput,
  type BackupTargetLive,
  type BackupTargetOverview,
  type BackupTargetStatus,
  type BackupTargetSummary,
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
  engine: toBackupEngine(row.engine),
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

// Does this target own the old flat `<database>/<file>` layout in its container?
//
// Only when exactly one target still carries that container in its legacy
// `azure_container` — with two candidates, showing those dumps under neither
// beats showing them under the wrong database server.
//
// Its own function because it answers two questions: whether a given blob is
// ours, and, before that, whether the whole container has to be listed to find
// our blobs at all (`listArchivedRecords`).
const claimsLegacyLayout = (
  target: BackupTargetRow,
  siblings: BackupTargetRow[],
  container: string
): boolean => {
  if (target.azure_container !== container) return false;
  const legacy = siblings.filter(
    (row) => row.azure_container === container && row.storage_id === target.storage_id
  );
  return legacy.length === 1 && legacy[0].id === target.id;
};

// Which blobs in a shared container belong to this target.
//
// Two layouts coexist. This app writes `<target prefix>/<database>/<file>`, so
// those attribute exactly. The older flat `<database>/<file>` has nothing to
// attribute by, hence the claim rule above.
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
  if (segments.length === 2) return claimsLegacyLayout(target, siblings, container);
  // A blob at the container root belongs to no database folder.
  return false;
};

// ---- the registry ----------------------------------------------------------

const inputToColumns = (input: BackupTargetInput): BackupTargetWriteColumns => {
  const cols: BackupTargetWriteColumns = {};
  if (input.name !== undefined) cols.name = input.name.trim();
  if (input.engine !== undefined) cols.engine = input.engine;
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
  // The column is a Postgres enum, so an unknown value fails the insert with a
  // type error from the driver. Named here instead, where the message can say
  // what the choices are.
  if (cols.engine !== undefined && !BACKUP_ENGINES.includes(cols.engine as BackupEngine)) {
    throw new Error(`The engine must be one of: ${BACKUP_ENGINES.join(', ')}.`);
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

// The targets a catch-all cron job would run: every one whose schedule is on.
//
// Sessionless, like the rest of the scheduled path — `listBackupTargets` reads
// under RLS and would hand pg_cron an empty list, which is a night with no
// backups and nothing to show for it.
export const listScheduledBackupTargetIds = async (): Promise<string[]> =>
  (await findAllBackupTargetsAsService())
    .filter((row) => row.schedule_enabled)
    .map((row) => row.id);

export const createBackupTarget = async (input: BackupTargetInput): Promise<BackupTarget> => {
  await requireAdmin('add a backup target');

  const cols = inputToColumns(input);
  if (!cols.db_host) throw new Error('The database host is required.');
  assertWritable(cols);
  if (!cols.name) cols.name = cols.db_host;
  // Whichever engine this is, not whichever one the column defaults to.
  if (!cols.db_port) {
    cols.db_port = BACKUP_ENGINE_DETAILS[(cols.engine as BackupEngine) ?? 'mysql'].defaultPort;
  }
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

// ---- reading: the fast tier ------------------------------------------------
//
// **Supabase only, and deliberately so.** Everything below this line answers
// from indexed tables the app already owns, so a Backups page draws itself in
// one round trip instead of waiting on a MySQL handshake to another host and a
// listing of an Azure container. Those two live under `getBackupTargetLive`,
// behind their own request.

// A `running` row is either a live run or a container that died, and only the
// clock tells them apart. Compared as instants rather than as strings: Postgres
// hands back `+00:00` offsets and `Date.toISOString` produces `Z`, and those two
// spellings do not sort against each other.
const isLiveRun = (startedAt: string | null): boolean => {
  if (!startedAt) return false;
  const started = Date.parse(startedAt);
  return Number.isFinite(started) && Date.now() - started < STALE_RUN_MS;
};

const statsToRuns = (row: BackupRunStatsRow | undefined): BackupRunStats => ({
  total: Number(row?.total_runs ?? 0),
  failed: Number(row?.failed_runs ?? 0),
  last: row?.last_started_at ?? '',
  isRunning: isLiveRun(row?.last_running_at ?? null),
});

// Which destinations actually hold a connection string, as a set — asked once
// for the whole page rather than per target, since targets share destinations.
const configuredStorageIds = async (rows: BackupTargetRow[]): Promise<Set<string>> => {
  const ids = [...new Set(rows.map((row) => row.storage_id).filter((id): id is string => !!id))];
  return new Set(await findStorageIdsWithSecret(ids));
};

// "Configured" means a destination is selected, it has a container, *and* its
// connection string is on file — a target pointing at an account nobody gave a
// key to has nowhere to write, which is the same problem as having no
// destination at all.
const isAzureConfigured = (row: BackupTargetRow, configured: Set<string>): boolean =>
  Boolean(row.storage_id) &&
  configured.has(row.storage_id as string) &&
  Boolean((row.backup_storage_accounts?.container ?? '').trim());

// The newest dispatch per target, out of one query over the recent ones.
const latestDispatchByTarget = (rows: BackupDispatchRow[]): Map<string, BackupDispatch> => {
  const latest = new Map<string, BackupDispatch>();
  for (const row of rows) {
    const dispatch = rowToDispatch(row);
    // Newest first from the query, so the first one seen per target wins.
    if (!latest.has(dispatch.targetId)) latest.set(dispatch.targetId, dispatch);
  }
  return latest;
};

// The index: one card's worth of facts per target, in four queries total
// however many targets there are.
export const listBackupTargetSummaries = async (): Promise<BackupTargetSummary[]> => {
  const rows = await findAllBackupTargets();
  if (rows.length === 0) return [];

  const [flags, dispatches, stats, configured] = await Promise.all([
    findBackupTargetSecretFlags(rows.map((row) => row.id)),
    findRecentBackupDispatches(200),
    findBackupRunStats(),
    configuredStorageIds(rows),
  ]);

  const statsByTarget = new Map(stats.map((row) => [row.target_id, row]));
  const dispatchByTarget = latestDispatchByTarget(dispatches);

  return rows.map((row) => ({
    target: rowToTarget(row, flags.get(row.id)),
    runs: statsToRuns(statsByTarget.get(row.id)),
    azureConfigured: isAzureConfigured(row, configured),
    lastDispatch: dispatchByTarget.get(row.id) ?? null,
  }));
};

// One target's page, fast tier: the same facts plus the runs this app performed.
//
// The dumps that exist only as blobs — everything the worker this feature
// replaced wrote — are *not* here. Finding them means listing the container, so
// they arrive with the live tier and the history merges them in.
export const getBackupTargetOverview = async (id: string): Promise<BackupTargetOverview> => {
  const row = await findBackupTargetById(id);
  if (!row) throw new Error('Backup target not found.');

  const [flags, runs, dispatches, stats, configured] = await Promise.all([
    findBackupTargetSecretFlags([id]),
    findBackupRuns(id),
    findRecentBackupDispatches(50),
    findBackupRunStatsFor(id),
    configuredStorageIds([row]),
  ]);

  return {
    target: rowToTarget(row, flags.get(id)),
    runs: statsToRuns(stats ?? undefined),
    azureConfigured: isAzureConfigured(row, configured),
    lastDispatch:
      dispatches.map(rowToDispatch).find((dispatch) => dispatch.targetId === id) ?? null,
    records: runs.map(rowToRecord),
  };
};

// ---- reading: the live tier ------------------------------------------------
//
// The two questions only another host can answer, asked together because they
// are the two slow things and neither depends on the other.

// Can this target be backed up right now?
//
// Answered by asking the server for its databases — the same call the runner
// makes — so "reachable" means reachable *for a backup*: the host resolves, the
// password works, and `mysqldump` exists in this image. A cheaper ping would
// report a health this feature cannot act on.
const resolveStatus = async (
  target: BackupTarget
): Promise<{ status: BackupTargetStatus; databases: string[] }> => {
  const base = { host: target.dbHost, port: target.dbPort };

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

// The dumps in the container this app has no row for.
//
// **Listed under this target's own prefix wherever it can be.** The container is
// shared and holds every dump every target ever wrote; asking Azure for all of
// it to keep the fraction belonging here costs that whole listing once per
// target. `<prefix>/` narrows it to exactly this target's blobs, server-side.
//
// The exception is that flat layout, which carries no prefix to narrow by — so
// the target claiming it lists the container and filters, as before.
const listArchivedRecords = async (
  row: BackupTargetRow,
  siblings: BackupTargetRow[]
): Promise<BackupRecord[]> => {
  const storage = await getStorageForWrite(row.storage_id);
  if (!storage.ok) return [];

  const legacy = claimsLegacyLayout(row, siblings, storage.container);
  // Nothing to ask for: no prefix of its own, and no claim on the flat layout.
  if (!row.blob_prefix && !legacy) return [];

  let blobs: BlobSummary[];
  try {
    blobs = await listBlobs(
      storage.connectionString,
      storage.container,
      legacy ? undefined : `${row.blob_prefix}/`
    );
  } catch {
    // Azure being unreachable costs us the older dumps, not the page — the run
    // rows are still a complete record of what this app did.
    return [];
  }

  const accountedFor = new Set(await findBackupRunBlobNames(row.id));

  return blobs
    .filter(
      (blob) =>
        !accountedFor.has(blob.name) &&
        blobBelongsToTarget(blob.name, row, siblings, storage.container)
    )
    .map(blobToRecord)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};

// One target's slow half: whether the database answers, which databases are on
// it, and which dumps are in the container that we have no row for.
//
// Both halves are outbound and neither depends on the other, so they go together
// and the page waits once rather than twice.
export const getBackupTargetLive = async (id: string): Promise<BackupTargetLive> => {
  const row = await findBackupTargetById(id);
  if (!row) throw new Error('Backup target not found.');

  const flags = await findBackupTargetSecretFlags([id]);
  const target = rowToTarget(row, flags.get(id));

  const [live, siblings] = await Promise.all([
    resolveStatus(target),
    // Needed to attribute the pre-unification blobs, which carry no target
    // prefix in their path.
    findAllBackupTargets(),
  ]);

  return {
    status: live.status,
    databases: live.databases,
    archived: await listArchivedRecords(row, siblings),
  };
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
