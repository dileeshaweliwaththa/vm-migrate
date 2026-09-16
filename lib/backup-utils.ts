import type { StatusTone } from '@/lib/vm-utils';
import { BACKUP_CRON_PRESETS, POSTGRES_GLOBALS_DUMP } from '@/types/common/backup';
import type {
  BackupLogEvent,
  BackupRecord,
  BackupTargetLive,
  BackupTargetSummary,
} from '@/types/common/backup';

// Presentation helpers for the Backups tab. Pure functions, no React, no data
// access — the same arrangement as `lib/vm-utils.ts`.

// Sizes come off the service in bytes and are read at a glance, so they are
// rendered at the unit a person would say out loud.
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

// A schedule in words. Every value the form can produce is one of the presets,
// so this is a lookup with the expression itself as the fallback — an older row
// may hold any valid five-field cron, and showing it is better than pretending
// not to recognise it.
export function describeCron(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed) return 'no schedule';
  return BACKUP_CRON_PRESETS.find((preset) => preset.value === trimmed)?.label ?? trimmed;
}

// Durations arrive in milliseconds. A dump that took 400ms and one that took
// four minutes both have to read correctly.
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

// The tone for a dump's outcome. Every pill that uses it also renders its status
// as text — see docs/ui-guidelines.md § Status tones.
//
// Three states, not four: the dump streams straight into Azure, so there is no
// "succeeded locally but never uploaded" any more. Success means the blob is
// there.
export function recordTone(record: BackupRecord): StatusTone {
  if (record.status === 'success') return 'success';
  if (record.status === 'running') return 'info';
  return 'danger';
}

export function recordLabel(record: BackupRecord): string {
  if (record.status === 'running') return 'Running';
  return record.status === 'success' ? 'Success' : 'Failed';
}

// How many of a target's dump entries are actually databases.
//
// A Postgres target's list starts with `_globals` — the cluster's roles and
// grants, which have to be dumped and restored but are not a database. It is a
// chip in the picker like any other, and it must not be counted in "19
// databases", which is a claim about the server.
export function countDatabases(databases: string[]): number {
  return databases.filter((name) => name !== POSTGRES_GLOBALS_DUMP).length;
}

// A target's whole history: the runs this app recorded, plus the dumps found in
// the container that no run row accounts for.
//
// The two arrive in separate payloads — one from Postgres, one from Azure — so
// the join happens here rather than on the server, and the rows render while the
// blobs are still being listed.
export function mergeRecords(records: BackupRecord[], archived: BackupRecord[]): BackupRecord[] {
  if (archived.length === 0) return records;
  // Newest first, which is the order every consumer of this list wants.
  return [...records, ...archived].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// The later of two ISO timestamps, either of which may be missing. A target's
// newest dump is whichever is newer of its last run row and the newest blob the
// container turned up, and those arrive separately.
export function newerTimestamp(a: string | undefined, b: string | undefined): string {
  if (!a) return b ?? '';
  if (!b) return a;
  return a > b ? a : b;
}

export interface BackupStats {
  targets: number;
  // Only targets that have actually been checked count — a check still in flight
  // is not a failure, and reporting it as one would flash a red number on every
  // page load.
  unreachable: number;
  // Every dump known about: the runs recorded here plus the older ones still in
  // the container. Grows as the live checks land.
  records: number;
  failed: number;
  // When the most recent dump anywhere was, ISO; '' when there is nothing yet.
  latest: string;
}

// The index header's line, assembled from both tiers: the counts Postgres
// aggregated, plus whatever the live checks have returned so far.
export function computeBackupStats(
  summaries: BackupTargetSummary[],
  live: Map<string, BackupTargetLive | undefined>
): BackupStats {
  let records = 0;
  let failed = 0;
  let unreachable = 0;
  let latest = '';

  for (const summary of summaries) {
    const checked = live.get(summary.target.id);
    records += summary.runs.total + (checked?.archived.length ?? 0);
    failed += summary.runs.failed;
    if (checked && !checked.status.reachable) unreachable += 1;

    // The archived list is newest first, so its head is the only candidate.
    latest = newerTimestamp(latest, newerTimestamp(summary.runs.last, checked?.archived[0]?.timestamp));
  }

  return { targets: summaries.length, unreachable, records, failed, latest };
}

// Timestamps are rendered in the reader's own locale, like the tracker's build
// times. An unparseable value is shown as-is rather than as "Invalid Date".
export function formatTimestamp(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

// One day's dumps, as the history renders them.
export interface BackupDay {
  // `YYYY-MM-DD` in the reader's own timezone — the key, and what sorts.
  key: string;
  label: string;
  records: BackupRecord[];
  totalSize: number;
  failed: number;
}

// A nightly run over eighteen databases is eighteen rows, so 200 records is a 
// fortnight of near-identical lines. Grouped by day they become "the 13th ran,
// all uploaded" — one line to check, openable when it isn't.
//
// Grouped by *local* day rather than by the worker's timestamp string: the
// question is "did last night's run go", which is a question about the reader's
// night.
export function groupRecordsByDay(records: BackupRecord[]): BackupDay[] {
  const byDay = new Map<string, BackupRecord[]>();

  for (const record of records) {
    const date = new Date(record.timestamp);
    // An unparseable timestamp still has to appear somewhere, so it gets its own
    // bucket rather than being dropped from the history.
    const key = Number.isNaN(date.getTime())
      ? 'unknown'
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
          date.getDate()
        ).padStart(2, '0')}`;
    const list = byDay.get(key) ?? [];
    list.push(record);
    byDay.set(key, list);
  }

  return Array.from(byDay.entries())
    // Newest first, with the unknown bucket last: it has no date to sort by.
    .sort((a, b) => {
      if (a[0] === 'unknown') return 1;
      if (b[0] === 'unknown') return -1;
      return b[0].localeCompare(a[0]);
    })
    .map(([key, dayRecords]) => ({
      key,
      label:
        key === 'unknown'
          ? 'Undated'
          : new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
      records: dayRecords,
      totalSize: dayRecords.reduce((total, record) => total + record.size, 0),
      failed: dayRecords.filter((record) => record.status === 'failed').length,
        }));
}

// The sentence for one step of a run. The runner writes the message, so this is
// only the fallback for a row that somehow has none — kept so the panel has one
// place to render from either way.
export function describeBackupEvent(event: BackupLogEvent): string {
  if (event.message) return event.message;
  return `${event.type}${event.database ? ` · ${event.database}` : ''}`;
}

// Whether a step is bad news, so the panel can colour it without deciding what
// "bad" means twice.
export function isBackupEventError(event: BackupLogEvent): boolean {
  return event.type === 'db_error';
}
