import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { createGzip } from 'node:zlib';
import {
  deleteBlob,
  listBlobs,
  uploadBlobStream,
} from '@/repositories/azure/azureBlobRepository';
import {
  listDatabases as listMysqlDatabases,
  openDumpStream,
  type MysqlConnection,
} from '@/repositories/mysql/mysqlDumpRepository';
import {
  countRunningBackups,
  finishBackupRun,
  insertBackupRun,
  insertBackupRunEvent,
} from '@/repositories/backupRuns/backupRunRepository';
import { findBackupTargetById } from '@/repositories/backupTargets/backupTargetRepository';
import { getBackupTargetSecrets } from '@/repositories/backupTargets/backupTargetSecretRepository';
import { getStorageForWrite } from '@/services/backups/backupStorageService';
import type { BackupTargetRow } from '@/types/supabase/response/backupTargets';

// The backup runner: this app dumps the databases itself.
//
//   mysqldump (stdout) → gzip → Azure Blob uploadStream
//
// **Nothing touches disk.** The three are pipes, so a 64MB database costs a few
// megabytes of memory rather than 64 of them plus a file to clean up. The worker
// container it replaces read the whole dump into a string (`maxBuffer: 500MB`),
// wrote it to local disk, then uploaded that file.
//
// It runs here because it can: this app is a long-lived Node process in a
// container we build, so it has `mysqldump` (Alpine's `mysql-client`, added to
// the Dockerfile) and no execution limit. That is what distinguishes it from a
// Supabase Edge Function, which has 2s of CPU, 256MB and no binaries — the
// constraint that sent the first version of this feature to an external worker.
//
// A run is **not** awaited by the request that starts it: eighteen databases is
// tens of minutes. `startBackup` records the batch, kicks the work off, and
// returns; progress and outcomes land in `backup_runs` / `backup_run_events`,
// which is what the page reads. Nothing is held in memory between requests, so a
// page reload — or a different person's browser — sees the same run.

// A `running` row older than this is treated as dead rather than as a run in
// progress: a container that was killed mid-dump leaves one behind forever, and
// the alternative is a target that can never be backed up again.
const STALE_RUN_MS = 3 * 60 * 60 * 1000;

// Blob names: `<target prefix>/<database>/<database>_<timestamp>.sql.gz`.
//
// The target's prefix comes first because one container is shared by every
// target now: two database servers can both have a `dev` database, and retention
// deletes by age *within* a prefix — without it, one target's seven-day policy
// would delete another's dumps.
const blobNameFor = (prefix: string, database: string, startedAt: Date): string => {
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const folder = prefix ? `${prefix}/` : '';
  return `${folder}${database}/${database}_${stamp}.sql.gz`;
};

export interface BackupRunnerConfig {
  target: BackupTargetRow;
  connection: MysqlConnection;
  azureConnectionString: string;
  azureContainer: string;
  // Everything this target writes lives under here. See `blobNameFor`.
  blobPrefix: string;
}

// Resolves everything a run needs, or says which part is missing. Called before
// anything is recorded, so a misconfigured target fails as a message rather than
// as a half-written batch.
export const resolveRunnerConfig = async (
  targetId: string
): Promise<{ ok: true; config: BackupRunnerConfig } | { ok: false; message: string }> => {
  const target = await findBackupTargetById(targetId);
  if (!target) return { ok: false, message: 'Backup target not found.' };

  const secrets = await getBackupTargetSecrets(targetId);

  if (!target.db_host.trim()) return { ok: false, message: 'This target has no database host.' };
  if (!target.db_user.trim()) return { ok: false, message: 'This target has no database user.' };
  if (!secrets.dbPassword) {
    return { ok: false, message: 'No database password is stored for this target.' };
  }
  // The destination is a shared storage account, chosen by this target — one
  // place the key is entered and rotated.
  const storage = await getStorageForWrite(target.storage_id);
  if (!storage.ok) return { ok: false, message: storage.message };

  return {
    ok: true,
    config: {
      target,
      connection: {
        host: target.db_host.trim(),
        port: target.db_port || 3306,
        user: target.db_user.trim(),
        password: secrets.dbPassword,
      },
      azureConnectionString: storage.connectionString,
      azureContainer: storage.container,
      blobPrefix: target.blob_prefix?.trim() ?? '',
    },
  };
};

// The databases this target can back up, straight from the server.
export const listTargetDatabases = async (
  targetId: string
): Promise<{ ok: boolean; databases: string[]; error?: string }> => {
  const resolved = await resolveRunnerConfig(targetId);
  if (!resolved.ok) return { ok: false, databases: [], error: resolved.message };

  const result = await listMysqlDatabases(resolved.config.connection);
  return { ok: result.ok, databases: result.databases, error: result.error };
};

// One database: dump → gzip → upload, recorded as one `backup_runs` row.
//
// The byte count comes from a counter in the middle of the pipe, because the
// upload returns no size and asking Azure afterwards is another round trip for a
// number we have already streamed past.
const backupOneDatabase = async (
  config: BackupRunnerConfig,
  batchId: string,
  database: string,
  source: 'manual' | 'schedule',
  requestedBy: string | null
): Promise<{ ok: boolean; size: number; error?: string }> => {
  const startedAt = new Date();
  const blobName = blobNameFor(config.blobPrefix, database, startedAt);

  const runId = await insertBackupRun({
    target_id: config.target.id,
    batch_id: batchId,
    database_name: database,
    blob_name: blobName,
    source,
    requested_by: requestedBy,
  });

  await insertBackupRunEvent({
    batch_id: batchId,
    target_id: config.target.id,
    type: 'db_dump',
    database_name: database,
    message: `Dumping ${database}`,
  });

  const dump = openDumpStream(config.connection, database);
  const gzip = createGzip();
  const counter = new PassThrough();
  let size = 0;
  counter.on('data', (chunk: Buffer) => {
    size += chunk.length;
  });

  dump.stream.pipe(gzip).pipe(counter);

  try {
    // Both have to finish, and the dump's failure is the one that matters: a
    // `mysqldump` that dies halfway still produces a valid *gzip* of a truncated
    // dump, which would upload happily and restore to nothing. So the upload is
    // awaited for its result and the dump for its exit code, and either one
    // failing fails the database.
    await Promise.all([
      uploadBlobStream(
        config.azureConnectionString,
        config.azureContainer,
        blobName,
        counter
      ),
      dump.completed,
    ]);

    await finishBackupRun(runId, {
      status: 'success',
      size_bytes: size,
      duration_ms: Date.now() - startedAt.getTime(),
    });
    await insertBackupRunEvent({
      batch_id: batchId,
      target_id: config.target.id,
      type: 'db_done',
      database_name: database,
      // The full blob name, prefix included — it is what you paste into Azure
      // to find this dump. The previous form showed the last two segments,
      // which silently hid the target's own folder.
      message: `Uploaded ${database} (${size} bytes) to ${blobName}`,
    });
    return { ok: true, size };
  } catch (error) {
    dump.cancel();
    const message = error instanceof Error ? error.message : 'unknown error';
    await finishBackupRun(runId, {
      status: 'failed',
      duration_ms: Date.now() - startedAt.getTime(),
      error: message,
    });
    await insertBackupRunEvent({
      batch_id: batchId,
      target_id: config.target.id,
      type: 'db_error',
      database_name: database,
      message: `Failed ${database}: ${message}`,
    });
    return { ok: false, size: 0, error: message };
  }
};

// Deletes blobs past the target's retention. Runs after a batch, and a failure
// here never fails the batch: the backups are made, and an old file surviving a
// day longer is not worth reporting a successful run as broken.
const applyRetention = async (config: BackupRunnerConfig, batchId: string): Promise<void> => {
  const days = config.target.retention_days || 0;
  if (days <= 0) return;

  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    // **Scoped to this target's prefix.** The container is shared, and another
    // target's retention is none of this run's business.
    const blobs = await listBlobs(
      config.azureConnectionString,
      config.azureContainer,
      config.blobPrefix ? `${config.blobPrefix}/` : undefined
    );
    const expired = blobs.filter(
      (blob) => blob.createdAt && new Date(blob.createdAt).getTime() < cutoff
    );

    for (const blob of expired) {
      await deleteBlob(config.azureConnectionString, config.azureContainer, blob.name);
    }

    if (expired.length) {
      await insertBackupRunEvent({
        batch_id: batchId,
        target_id: config.target.id,
        type: 'retention',
        message: `Removed ${expired.length} dump(s) older than ${days} days`,
      });
    }
  } catch (error) {
    await insertBackupRunEvent({
      batch_id: batchId,
      target_id: config.target.id,
      type: 'retention',
      message: `Retention cleanup failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    });
  }
};

// Dumps the databases one at a time.
//
// Sequential on purpose: `mysqldump` with `--single-transaction` is cheap on the
// server but the uploads are not, and eighteen concurrent streams would compete
// for the same bandwidth while multiplying the memory held in flight. The
// previous worker was sequential too, so the nightly window is unchanged.
const runBatch = async (
  config: BackupRunnerConfig,
  batchId: string,
  databases: string[],
  source: 'manual' | 'schedule',
  requestedBy: string | null
): Promise<void> => {
  await insertBackupRunEvent({
    batch_id: batchId,
    target_id: config.target.id,
    type: 'start',
    message: `Starting backup of ${databases.length} database(s)`,
  });

  let succeeded = 0;
  for (const database of databases) {
    const result = await backupOneDatabase(config, batchId, database, source, requestedBy);
    if (result.ok) succeeded += 1;
  }

  await applyRetention(config, batchId);

  await insertBackupRunEvent({
    batch_id: batchId,
    target_id: config.target.id,
    type: 'complete',
    message: `Finished — ${succeeded}/${databases.length} database(s) backed up`,
  });
};

export interface StartBackupResult {
  ok: boolean;
  message: string;
  batchId?: string;
  databases?: string[];
}

// Starts a run and returns immediately.
//
// `databases` empty means every database on the server, which is what a
// scheduled run always asks for.
export const startBackup = async (
  targetId: string,
  databases: string[],
  source: 'manual' | 'schedule',
  requestedBy: string | null
): Promise<StartBackupResult> => {
  const resolved = await resolveRunnerConfig(targetId);
  if (!resolved.ok) return { ok: false, message: resolved.message };

  // One run per target at a time. Two concurrent dumps of the same server would
  // double the load for no benefit and race each other's retention pass.
  const running = await countRunningBackups(
    targetId,
    new Date(Date.now() - STALE_RUN_MS).toISOString()
  );
  if (running > 0) {
    return { ok: false, message: 'A backup is already running for this target.' };
  }

  const requested = databases.filter((name) => typeof name === 'string' && name.trim());
  let selected = requested;
  if (selected.length === 0) {
    const all = await listMysqlDatabases(resolved.config.connection);
    if (!all.ok) {
      return { ok: false, message: all.error ?? 'Could not list the databases to back up.' };
    }
    selected = all.databases;
  }
  if (selected.length === 0) {
    return { ok: false, message: 'The server reported no databases to back up.' };
  }

  const batchId = randomUUID();

  // Deliberately not awaited: the caller is an HTTP request and this takes
  // minutes. Errors are recorded as events and as failed rows, so an unhandled
  // rejection here would only lose the *reason* — hence the catch.
  void runBatch(resolved.config, batchId, selected, source, requestedBy).catch((error) =>
    insertBackupRunEvent({
      batch_id: batchId,
      target_id: targetId,
      type: 'db_error',
      message: `Run aborted: ${error instanceof Error ? error.message : 'unknown error'}`,
    })
  );

  return {
    ok: true,
    message: `Backing up ${selected.length} database(s).`,
    batchId,
    databases: selected,
  };
};
