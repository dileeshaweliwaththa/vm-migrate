import type { StatusTone } from '@/lib/vm-utils';
import type { BackupRecord, BackupTargetOverview } from '@/types/common/backup';

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
export function recordTone(record: BackupRecord): StatusTone {
  if (record.status === 'success') return record.azureUploaded ? 'success' : 'warning';
  if (record.status === 'running') return 'info';
  return 'danger';
}

// What a record's state is *called*. A successful dump that never reached Azure
// is the case worth naming: the file exists, the off-site copy doesn't.
export function recordLabel(record: BackupRecord): string {
  if (record.status === 'running') return 'Running';
  if (record.status !== 'success') return 'Failed';
  return record.azureUploaded ? 'Success' : 'Local only';
}

export interface BackupStats {
  targets: number;
  unreachable: number;
  // Dumps recorded across every reachable worker — the histories are capped by
  // the worker at 200 each, so this is "recent", not "ever".
  records: number;
  failed: number;
  // Successful dumps that never made it to Azure.
  localOnly: number;
  // The most recent dump anywhere, or null when there is nothing yet.
  latest: BackupRecord | null;
}

export function computeBackupStats(overviews: BackupTargetOverview[]): BackupStats {
  const records = overviews.flatMap((overview) => overview.records);
  const latest = records.reduce<BackupRecord | null>((newest, record) => {
    if (!record.timestamp) return newest;
    if (!newest) return record;
    return record.timestamp > newest.timestamp ? record : newest;
  }, null);

  return {
    targets: overviews.length,
    unreachable: overviews.filter((overview) => !overview.status.reachable).length,
    records: records.length,
    failed: records.filter((record) => record.status === 'failed').length,
    localOnly: records.filter((record) => record.status === 'success' && !record.azureUploaded)
      .length,
    latest,
  };
}

// Timestamps are rendered in the reader's own locale, like the tracker's build
// times. An unparseable value is shown as-is rather than as "Invalid Date".
export function formatTimestamp(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

// Is the worker's own node-cron still running alongside the Supabase schedule?
// Two schedulers means the same dumps twice a night, and the second one is
// invisible from here — so this is worth surfacing on the card rather than
// leaving to be noticed in the history.
export function hasDuplicateSchedule(overview: BackupTargetOverview): boolean {
  return overview.target.scheduleEnabled && overview.status.reachable && overview.status.cronEnabled;
}

// Does the worker's configured MySQL host match what this target says it is?
// The worker still reads its own `.env`, so a target edited here and a container
// never redeployed will disagree — and the backups would be of the wrong server.
export function hasHostMismatch(overview: BackupTargetOverview): boolean {
  const configured = overview.target.dbHost.trim().toLowerCase();
  const actual = overview.status.host.trim().toLowerCase();
  return Boolean(configured) && Boolean(actual) && configured !== actual;
}
