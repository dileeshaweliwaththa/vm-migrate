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
import * as api from '@/repositories/backups/backupApiRepository';
import { getAuthenticatedUser } from '@/repositories/auth/authRepository';
import { getCurrentRole } from '@/services/auth/authService';
import { canEdit, isAdmin } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import { isDeniedOutboundTarget, normalizeServiceUrl } from '@/lib/outbound-url';
import type {
  BackupDispatchRow,
  BackupTargetRow,
} from '@/types/supabase/response/backupTargets';
import {
  BACKUP_DISPATCH_SOURCES,
  BACKUP_DISPATCH_STATUSES,
  BACKUP_STATUSES,
  BACKUP_TRIGGERS,
  BACKUP_WORKER_PORT,
  type BackupDispatch,
  type BackupDispatchSource,
  type BackupDispatchStatus,
  type BackupLogPage,
  type BackupRecord,
  type BackupStatus,
  type BackupTarget,
  type BackupTargetInput,
  type BackupTargetOverview,
  type BackupTrigger,
  type BackupWorkerStatus,
} from '@/types/common/backup';

// Service layer: database backups.
//
// Supabase owns the **configuration**, the **credentials** and the **schedule**:
// a target row says what to connect to, where the dumps go and when, its
// password and Azure connection string live in a service-role-only table, and
// pg_cron fires the `backup-dispatch` Edge Function on the target's own cron
// expression.
//
// The worker container owns the **dumping**. That split is not a preference:
// Edge Functions cap CPU time at 2s with 256MB of memory and no mysqldump, and
// one of these databases is 64MB and takes 245s of real work. See
// docs/backups.md.
//
// So this module does three things: enforce who may press what, turn another
// app's JSON into types the UI can trust, and never let a credential out.

// ---- authorization ---------------------------------------------------------
//
// Reading is open to every signed-in role. Registering a target and running a
// backup are editor work — a run is additive, it only ever creates a dump.
// Deleting a dump, deleting a target and changing the schedule are the
// irreversible ones, so they are admin-only: the same line the tracker draws at
// purge and clear-trash.

const requireEditor = async (action: string): Promise<void> => {
  if (!canEdit(await getCurrentRole())) {
    throw new ForbiddenError(`Editor access required to ${action}.`);
  }
};

const requireAdmin = async (action: string): Promise<void> => {
  if (!isAdmin(await getCurrentRole())) {
    throw new ForbiddenError(`Admin access required to ${action}.`);
  }
};

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
  azureAccount: row.azure_account,
  azureContainer: row.azure_container,
  retentionDays: row.retention_days,
  cronSchedule: row.cron_schedule,
  scheduleEnabled: row.schedule_enabled,
  notes: row.notes,
  position: row.position,
  // Absent flags mean "not looked up", which reads as not stored. Every path
  // that shows them looks them up.
  hasDbPassword: flags?.hasDbPassword ?? false,
  hasAzureConnection: flags?.hasAzureConnection ?? false,
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

// The worker reports one database per record, in an array of one. Flattened here
// so the UI never reasons about a list that is always length 1.
const rawToRecord = (raw: api.RawBackup): BackupRecord => {
  const status = (raw.status ?? '') as BackupStatus;
  const trigger = (raw.triggerType ?? '') as BackupTrigger;
  return {
    id: String(raw.id ?? ''),
    database: raw.databases?.[0] ?? '',
    filename: raw.filename ?? '',
    size: typeof raw.size === 'number' ? raw.size : 0,
    duration: typeof raw.duration === 'number' ? raw.duration : 0,
    timestamp: raw.timestamp ?? '',
    // Validated against our own enums rather than trusted: an unrecognised value
    // renders as a failure, which is the safe way to be wrong about a backup.
    status: BACKUP_STATUSES.includes(status) ? status : 'failed',
    error: raw.error ?? '',
    trigger: BACKUP_TRIGGERS.includes(trigger) ? trigger : 'auto',
    azureUploaded: Boolean(raw.azureUploaded),
    azureUrl: raw.azureBlobUrl ?? '',
    azureError: raw.azureError ?? '',
  };
};

const unreachable = (error: string): BackupWorkerStatus => ({
  reachable: false,
  error,
  host: '',
  port: 0,
  cronSchedule: '',
  cronEnabled: false,
  isBackupRunning: false,
  azureEnabled: false,
  azureContainer: '',
});

const rawToStatus = (raw: api.RawStatus): BackupWorkerStatus => ({
  reachable: true,
  error: '',
  host: raw.host ?? '',
  port: typeof raw.port === 'number' ? raw.port : 0,
  cronSchedule: raw.cronSchedule ?? '',
  cronEnabled: Boolean(raw.cronEnabled),
  isBackupRunning: Boolean(raw.isBackupRunning),
  azureEnabled: Boolean(raw.azureEnabled),
  azureContainer: raw.azureContainerName ?? '',
});

// What to say when a worker didn't answer. The status code matters: a refused
// connection and a 502 from a proxy in front of a stopped container send you to
// different places.
const statusError = (result: api.ApiResult<unknown>): string => {
  if (result.status === 0) return result.error ?? 'The worker could not be reached.';
  return `The worker answered HTTP ${result.status}.`;
};

// ---- reaching a worker -----------------------------------------------------

// Resolves a registered target to the worker address we may actually fetch, or
// an error saying why not.
//
// The denylist check happens **here**, on every call, rather than only when the
// URL is saved: the row could have been written before a rule tightened, and a
// URL that "is already in the table" is not a reason to fetch it. See
// docs/security.md § SSRF.
const resolveWorker = async (
  id: string
): Promise<{ ok: true; target: BackupTarget } | { ok: false; message: string }> => {
  const row = await findBackupTargetById(id);
  if (!row) return { ok: false, message: 'Backup target not found.' };

  const target = rowToTarget(row);
  if (!target.workerUrl.trim()) {
    return { ok: false, message: 'This target has no backup worker address set.' };
  }
  if (isDeniedOutboundTarget(target.workerUrl)) {
    return { ok: false, message: 'That worker address is not allowed.' };
  }
  return { ok: true, target };
};

// ---- the registry ----------------------------------------------------------

const inputToColumns = (input: BackupTargetInput): BackupTargetWriteColumns => {
  const cols: BackupTargetWriteColumns = {};
  if (input.name !== undefined) cols.name = input.name.trim();
  // `20.197.41.68` in, `http://20.197.41.68:2999` out — 2999 is the worker's own
  // default port, so the address is normally just the machine's.
  if (input.workerUrl !== undefined) {
    cols.worker_url = normalizeServiceUrl(input.workerUrl, BACKUP_WORKER_PORT);
  }
  if (input.dbHost !== undefined) cols.db_host = input.dbHost.trim();
  if (input.dbPort !== undefined) cols.db_port = input.dbPort;
  if (input.dbUser !== undefined) cols.db_user = input.dbUser.trim();
  if (input.azureAccount !== undefined) cols.azure_account = input.azureAccount.trim();
  if (input.azureContainer !== undefined) cols.azure_container = input.azureContainer.trim();
  if (input.retentionDays !== undefined) cols.retention_days = input.retentionDays;
  if (input.cronSchedule !== undefined) cols.cron_schedule = input.cronSchedule.trim();
  if (input.scheduleEnabled !== undefined) cols.schedule_enabled = input.scheduleEnabled;
  if (input.notes !== undefined) cols.notes = input.notes;
  if (input.position !== undefined) cols.position = input.position;
  return cols;
};

// A five-field cron expression, which is what pg_cron takes. Checked here
// because the alternative is a `cron.schedule` that throws inside a trigger and
// fails the whole write with a Postgres message.
const isCronExpression = (value: string): boolean =>
  value.trim().split(/\s+/).length === 5;

const assertWritable = (cols: BackupTargetWriteColumns): void => {
  if (cols.worker_url !== undefined) {
    if (!cols.worker_url) throw new Error('The backup worker address is required.');
    if (isDeniedOutboundTarget(cols.worker_url)) {
      throw new Error('That worker address is not allowed.');
    }
  }
  if (cols.cron_schedule !== undefined && cols.cron_schedule && !isCronExpression(cols.cron_schedule)) {
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
  await requireEditor('add a backup target');

  const cols = inputToColumns(input);
  if (cols.worker_url === undefined) throw new Error('The backup worker address is required.');
  assertWritable(cols);
  // Named after the database server when no name is given, so the card is never
  // blank.
  if (!cols.name) cols.name = cols.db_host || cols.worker_url.replace(/^https?:\/\//, '');
  if (cols.position === undefined) cols.position = await countBackupTargets();

  const row = await insertBackupTarget(cols);
  await setBackupTargetSecrets(row.id, {
    dbPassword: input.dbPassword,
    azureConnectionString: input.azureConnectionString,
  });

  const flags = await findBackupTargetSecretFlags([row.id]);
  return rowToTarget(row, flags.get(row.id));
};

export const updateBackupTarget = async (
  id: string,
  input: BackupTargetInput
): Promise<BackupTarget> => {
  // The schedule is admin-only, and it travels in the same payload as the rest
  // of the configuration — so the *presence* of a schedule field is what raises
  // the bar, rather than a second route nobody would notice was unguarded.
  if (input.cronSchedule !== undefined || input.scheduleEnabled !== undefined) {
    await requireAdmin("change a backup target's schedule");
  } else {
    await requireEditor('edit a backup target');
  }

  const cols = inputToColumns(input);
  assertWritable(cols);

  const row = await updateBackupTargetRow(id, cols);
  // Blank means "keep the stored one": the form is never sent a credential, so
  // an empty field cannot mean "clear it".
  await setBackupTargetSecrets(id, {
    dbPassword: input.dbPassword?.trim() ? input.dbPassword : undefined,
    azureConnectionString: input.azureConnectionString?.trim()
      ? input.azureConnectionString
      : undefined,
  });

  const flags = await findBackupTargetSecretFlags([id]);
  return rowToTarget(row, flags.get(id));
};

// Removes the target, its credentials (cascade) and its pg_cron job (the
// trigger). The dumps themselves are untouched: they live on the worker's host
// and in Azure, and this app never had them.
export const deleteBackupTarget = async (id: string): Promise<void> => {
  await requireAdmin('remove a backup target');
  await deleteBackupTargetRow(id);
};

// ---- reading through to a worker -------------------------------------------

// Everything the page needs for one target in a single call: its state, the
// databases it can dump, what it has dumped, and when a run was last asked for.
//
// A worker that cannot be reached returns an **overview**, not an error: which
// backups exist is exactly what you want when a host is down, and it is the
// history that is unavailable, not the page.
export const getBackupTargetOverview = async (id: string): Promise<BackupTargetOverview> => {
  const row = await findBackupTargetById(id);
  if (!row) throw new Error('Backup target not found.');

  const flags = await findBackupTargetSecretFlags([id]);
  const target = rowToTarget(row, flags.get(id));
  const lastDispatch =
    (await findRecentBackupDispatches(50))
      .map(rowToDispatch)
      .find((dispatch) => dispatch.targetId === id) ?? null;

  if (!target.workerUrl.trim() || isDeniedOutboundTarget(target.workerUrl)) {
    return {
      target,
      status: unreachable(
        target.workerUrl.trim()
          ? 'That worker address is not allowed.'
          : 'This target has no backup worker address set.'
      ),
      databases: [],
      records: [],
      lastDispatch,
    };
  }

  // Three independent reads — run them together rather than in sequence.
  const [status, databases, backups] = await Promise.all([
    api.fetchStatus(target.workerUrl),
    api.fetchDatabases(target.workerUrl),
    api.fetchBackups(target.workerUrl),
  ]);

  return {
    target,
    status: status.ok && status.data ? rawToStatus(status.data) : unreachable(statusError(status)),
    databases: databases.data?.databases ?? [],
    records: (backups.data?.backups ?? []).map(rawToRecord),
    lastDispatch,
  };
};

export const listBackupTargetOverviews = async (): Promise<BackupTargetOverview[]> => {
  const rows = await findAllBackupTargets();
  if (rows.length === 0) return [];

  // Read the shared tables once for the whole page, then fan out to the workers
  // in parallel: one slow or dead host must not delay every other card.
  const [flags, dispatches] = await Promise.all([
    findBackupTargetSecretFlags(rows.map((row) => row.id)),
    findRecentBackupDispatches(200),
  ]);

  const latestByTarget = new Map<string, BackupDispatch>();
  for (const row of dispatches) {
    const dispatch = rowToDispatch(row);
    // Newest first from the query, so the first one seen per target wins.
    if (!latestByTarget.has(dispatch.targetId)) latestByTarget.set(dispatch.targetId, dispatch);
  }

  return Promise.all(
    rows.map(async (row) => {
      const target = rowToTarget(row, flags.get(row.id));
      const lastDispatch = latestByTarget.get(row.id) ?? null;

      if (!target.workerUrl.trim() || isDeniedOutboundTarget(target.workerUrl)) {
        return {
          target,
          status: unreachable(
            target.workerUrl.trim()
              ? 'That worker address is not allowed.'
              : 'This target has no backup worker address set.'
          ),
          databases: [],
          records: [],
          lastDispatch,
        };
      }

      const [status, databases, backups] = await Promise.all([
        api.fetchStatus(target.workerUrl),
        api.fetchDatabases(target.workerUrl),
        api.fetchBackups(target.workerUrl),
      ]);

      return {
        target,
        status:
          status.ok && status.data ? rawToStatus(status.data) : unreachable(statusError(status)),
        databases: databases.data?.databases ?? [],
        records: (backups.data?.backups ?? []).map(rawToRecord),
        lastDispatch,
      };
    })
  );
};

// A run's progress. `since` is the last event index the client has, so the page
// polls for the tail rather than re-reading the whole session.
export const getBackupLogs = async (id: string, since: number): Promise<BackupLogPage> => {
  const worker = await resolveWorker(id);
  if (!worker.ok) return { sessionId: '', isRunning: false, total: 0, events: [] };

  const result = await api.fetchLogs(worker.target.workerUrl, Math.max(0, since));
  const page = result.data;
  return {
    sessionId: page?.sessionId ?? '',
    isRunning: Boolean(page?.isRunning),
    total: typeof page?.total === 'number' ? page.total : 0,
    events: (page?.events ?? []).map((event, i) => ({
      // The worker names this field differently across its two log endpoints,
      // and the index is the fallback so paging still advances either way.
      seq: typeof event.seq === 'number' ? event.seq : (event.id ?? since + i + 1),
      timestamp: event.timestamp ?? event.created_at ?? '',
      message: event.message ?? '',
      level: event.level ?? event.type ?? 'info',
    })),
  };
};

// ---- acting on a target ----------------------------------------------------

// Starts a dump now. Additive — it only ever creates a backup — so editor is the
// bar, and the dispatch row records who asked, which is what keeps a manual run
// from being anonymous.
export const runBackup = async (
  id: string,
  databases: string[]
): Promise<{ ok: boolean; message: string }> => {
  await requireEditor('run a backup');

  const worker = await resolveWorker(id);
  if (!worker.ok) return { ok: false, message: worker.message };

  const user = await getAuthenticatedUser();
  const result = await api.runBackup(
    worker.target.workerUrl,
    databases.filter((name) => typeof name === 'string' && name.trim())
  );

  // 409 is the worker's "already running", which is information rather than a
  // failure — the page should show the run in progress, not an error.
  const alreadyRunning = result.status === 409;
  const failed = !alreadyRunning && (!result.ok || !result.data?.success);

  await insertBackupDispatch({
    target_id: id,
    source: 'manual',
    status: failed ? 'failed' : 'dispatched',
    http_status: result.status,
    error: failed ? (result.data?.error ?? statusError(result)) : '',
    requested_by: user?.id ?? null,
  });

  if (alreadyRunning) {
    return { ok: false, message: 'A backup is already running on this worker.' };
  }
  if (failed) {
    return { ok: false, message: result.data?.error ?? statusError(result) };
  }

  const records = (result.data?.records ?? []).map(rawToRecord);
  const unsuccessful = records.filter((record) => record.status !== 'success');
  return {
    ok: unsuccessful.length === 0,
    message: unsuccessful.length
      ? `${records.length - unsuccessful.length}/${records.length} database(s) backed up — ${unsuccessful
          .map((record) => record.database || 'unknown')
          .join(', ')} failed.`
      : `Backed up ${records.length} database(s).`,
  };
};

// Hands back the worker's response for a dump so a route can stream it to the
// browser. Editor+, unlike the rest of reading: everything else on this page is
// *metadata* about the backups, while this is the database contents — every row
// of every table, in one click. Viewers can see that a backup exists and
// succeeded without being handed the data itself.
export const downloadBackup = async (
  id: string,
  recordId: string
): Promise<{ ok: true; response: Response } | { ok: false; message: string }> => {
  await requireEditor('download a backup');

  const worker = await resolveWorker(id);
  if (!worker.ok) return { ok: false, message: worker.message };

  const response = await api.downloadBackup(worker.target.workerUrl, recordId);
  if (!response) return { ok: false, message: 'The worker could not be reached.' };
  if (!response.ok) {
    return {
      ok: false,
      message:
        response.status === 404
          ? 'That dump is no longer on the worker (it may have aged out of retention).'
          : `The worker answered HTTP ${response.status}.`,
    };
  }
  return { ok: true, response };
};

export const reuploadBackup = async (
  id: string,
  recordId: string
): Promise<{ ok: boolean; message: string }> => {
  await requireEditor('re-upload a backup');

  const worker = await resolveWorker(id);
  if (!worker.ok) return { ok: false, message: worker.message };

  const result = await api.reuploadBackup(worker.target.workerUrl, recordId);
  if (!result.ok || !result.data?.success) {
    return { ok: false, message: result.data?.error ?? statusError(result) };
  }
  return { ok: true, message: 'Uploaded to Azure.' };
};

// Deletes the dump itself, on the worker's host. Irreversible and admin-only.
export const deleteBackupRecord = async (
  id: string,
  recordId: string
): Promise<{ ok: boolean; message: string }> => {
  await requireAdmin('delete a backup');

  const worker = await resolveWorker(id);
  if (!worker.ok) return { ok: false, message: worker.message };

  const result = await api.deleteBackup(worker.target.workerUrl, recordId);
  if (!result.ok || !result.data?.success) {
    return { ok: false, message: result.data?.error ?? statusError(result) };
  }
  return { ok: true, message: 'Backup deleted.' };
};

// Turns the **worker's own** node-cron on or off.
//
// This is not the schedule any more — pg_cron is (see the target's
// `cronSchedule`). It is here because the worker ships with its own scheduler,
// and one left running means two nightly runs of the same dumps. Admin-only,
// like anything that changes when backups happen.
//
// The worker's endpoint is a *toggle* with no argument, so `enabled` is what the
// caller wants and this checks what it got: if the worker was already in that
// state, the toggle would have moved it the wrong way.
export const setWorkerCronEnabled = async (
  id: string,
  enabled: boolean
): Promise<{ ok: boolean; message: string; cronEnabled: boolean }> => {
  await requireAdmin("change a backup worker's own schedule");

  const worker = await resolveWorker(id);
  if (!worker.ok) return { ok: false, message: worker.message, cronEnabled: false };

  const status = await api.fetchStatus(worker.target.workerUrl);
  if (!status.ok || !status.data) {
    return { ok: false, message: statusError(status), cronEnabled: false };
  }
  if (Boolean(status.data.cronEnabled) === enabled) {
    return {
      ok: true,
      message: `The worker's own schedule is already ${enabled ? 'on' : 'off'}.`,
      cronEnabled: enabled,
    };
  }

  const result = await api.toggleCron(worker.target.workerUrl);
  if (!result.ok || !result.data?.success) {
    return { ok: false, message: statusError(result), cronEnabled: !enabled };
  }

  const now = Boolean(result.data.cronEnabled);
  return {
    ok: now === enabled,
    message:
      now === enabled
        ? `The worker's own schedule is now ${enabled ? 'on' : 'off'}.`
        : 'The worker reported a different schedule state than requested.',
    cronEnabled: now,
  };
};
