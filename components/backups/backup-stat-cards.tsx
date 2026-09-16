'use client';

import { Archive, CalendarClock, Cloud, Database } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { STATUS_PILL_CLASS, STATUS_TONE_CLASS } from '@/lib/vm-utils';
import { countDatabases, formatTimestamp, recordLabel, recordTone } from '@/lib/backup-utils';
import type { BackupRecord, BackupTargetLive, BackupTargetOverview } from '@/types/common/backup';

// The four numbers you want before anything else: how many dumps exist, when the
// last one was, how many databases are on the server, and where the dumps go.
//
// Composed from `Card`, one per stat, on the muted surface so a row of them reads
// as a panel *inside* the target card rather than as four more cards.
//
// Two of the four are answered by Postgres and two by the database server, and
// they arrive separately. The pair that has to wait renders as a pulsing dash
// rather than as a zero — on a backup page, "no databases" and "we have not
// asked yet" must not look the same.

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

function Pending() {
  return <span className="animate-pulse font-mono text-muted-foreground">—</span>;
}

export function BackupStatCards({
  overview,
  live,
  records,
  checking,
}: {
  overview: BackupTargetOverview;
  // Undefined until the target's live check answers, or for good if it failed.
  live: BackupTargetLive | undefined;
  // The merged history — this app's runs plus whatever the container turned up.
  records: BackupRecord[];
  checking: boolean;
}) {
  const { target, azureConfigured } = overview;
  const latest = records[0] ?? null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Backups"
        icon={<Archive className="size-3.5" />}
        value={<span className="font-mono">{records.length}</span>}
        sub={checking ? 'counting the container…' : 'recorded'}
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
              <span className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS[recordTone(latest)])}>
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
        value={
          live ? (
            <span className="font-mono">
              {live.status.reachable ? countDatabases(live.databases) : '—'}
            </span>
          ) : (
            <Pending />
          )
        }
        // Reachability belongs here: the count comes *from* the connection, so
        // its absence and the reason are the same fact.
        tone={!live || live.status.reachable ? undefined : 'text-destructive'}
        sub={
          !live
            ? checking
              ? 'asking the server…'
              : 'could not be checked'
            : live.status.reachable
              ? `on ${live.status.host || target.dbHost}`
              : live.status.error || 'database unreachable'
        }
      />
      <Stat
        label="Destination"
        icon={<Cloud className="size-3.5" />}
        // Where the dumps go. The app streams them straight into this container,
        // so it is the whole answer to "where are my backups".
        value={
          <span className="text-body-md font-medium">
            {azureConfigured ? 'Azure Blob' : 'Not configured'}
          </span>
        }
        tone={azureConfigured ? undefined : 'text-destructive'}
        sub={
          azureConfigured ? (
            <span className="font-mono text-label-mono">
              {target.storageContainer}
              {target.blobPrefix ? `/${target.blobPrefix}` : ''}
            </span>
          ) : (
            'select a destination under Azure Storage'
          )
        }
      />
    </div>
  );
}
