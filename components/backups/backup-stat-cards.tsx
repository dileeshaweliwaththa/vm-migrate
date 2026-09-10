'use client';

import { Archive, CalendarClock, Database, ServerCog } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASS } from '@/lib/vm-utils';
import { formatTimestamp, recordLabel, recordTone } from '@/lib/backup-utils';
import type { BackupTargetOverview } from '@/types/common/backup';

// The four numbers you want before anything else — the same four the worker's own
// dashboard leads with: how many dumps exist, when the last one was, how many
// databases are on the server, and whether the worker is up.
//
// Composed from `Card`, one per stat, on the muted surface so a row of them reads
// as a panel *inside* the target card rather than as four more cards.

function Stat({
  label,
  icon,
  value,
  sub,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  // The line under the value: the context that makes the number mean something
  // ("All time", "user databases", the host).
  sub?: React.ReactNode;
  tone?: string;
}) {
  return (
    <Card className="gap-0 rounded-md border-border bg-muted/30 py-0 shadow-none">
      <CardContent className="space-y-1 px-3 py-3">
        <p className="flex items-center gap-1.5 text-label-caps uppercase text-muted-foreground">
          {icon}
          {label}
        </p>
        <p className={cn('font-display text-headline-md tracking-normal', tone)}>{value}</p>
        {sub ? <div className="text-body-sm text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

export function BackupStatCards({ overview }: { overview: BackupTargetOverview }) {
  const { status, databases, records, target } = overview;
  // The history is the worker's 200 most recent, so "total" is honestly capped —
  // said in the sub-line rather than implied by the number.
  const latest = records[0] ?? null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Backups"
        icon={<Archive className="size-3.5" />}
        value={<span className="font-mono">{records.length}</span>}
        sub={records.length >= 200 ? 'most recent 200' : 'recorded'}
      />
      <Stat
        label="Last backup"
        icon={<CalendarClock className="size-3.5" />}
        value={
          <span className="text-body-md font-medium">
            {latest ? formatTimestamp(latest.timestamp) : '—'}
          </span>
        }
        sub={
          latest ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
                  STATUS_TONE_CLASS[recordTone(latest)]
                )}
              >
                {recordLabel(latest)}
              </span>
              <span className="text-label-caps uppercase">{latest.trigger}</span>
              <span className="font-mono text-label-mono">{latest.database}</span>
            </span>
          ) : (
            'nothing recorded yet'
          )
        }
      />
      <Stat
        label="Databases"
        icon={<Database className="size-3.5" />}
        value={<span className="font-mono">{status.reachable ? databases.length : '—'}</span>}
        sub={status.reachable ? 'on the server' : 'worker unreachable'}
      />
      <Stat
        label="Worker"
        icon={<ServerCog className="size-3.5" />}
        // Three states, and the middle one is the one people look for: a run in
        // progress. Always a word, never a colour alone.
        value={
          <span className="text-body-md font-medium">
            {status.reachable ? (status.isBackupRunning ? 'Backing up' : 'Online') : 'Unreachable'}
          </span>
        }
        tone={
          status.reachable
            ? status.isBackupRunning
              ? 'text-ink-accent'
              : 'text-positive'
            : 'text-destructive'
        }
        sub={
          status.reachable ? (
            <span className="font-mono text-label-mono">
              {status.host || target.dbHost}
              {status.port ? `:${status.port}` : ''}
            </span>
          ) : (
            status.error || 'no response'
          )
        }
      />
    </div>
  );
}
