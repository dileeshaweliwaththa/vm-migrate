'use client';

import Link from 'next/link';
import { AlertTriangle, Archive, CalendarClock, Cloud, Database, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';
import { isAdmin } from '@/lib/rbac';
import { STATUS_PILL_CLASS, STATUS_TONE_CLASS } from '@/lib/vm-utils';
import {
  computeBackupStats,
  countDatabases,
  describeCron,
  formatTimestamp,
  newerTimestamp,
} from '@/lib/backup-utils';
import { useBackupTargets, useBackupTargetsLive } from '@/hooks/backups/useBackups';
import type { UserRole } from '@/types/common';
import {
  BACKUP_ENGINE_DETAILS,
  type BackupTargetLive,
  type BackupTargetSummary,
} from '@/types/common/backup';
import { BackupStorageDialog } from '@/components/backups/backup-storage-dialog';
import { BackupTargetDialog } from '@/components/backups/backup-target-dialog';

// The Backups index: one card per target, each opening its own page.
//
// It used to be one long page with every target's stat cards, database picker,
// log panel and 200-row history stacked — which worked for exactly one target.
// Same two-level shape as Projects now: a grid you scan, and a page you work in.
//
// A card answers only "is this database being backed up, and is anything wrong":
// the target's state, when the last dump was, the schedule, and the
// misconfiguration that hides itself (a target with nowhere to put a dump).
//
// **It draws in two passes.** The card's text — name, host, schedule,
// destination, how many dumps there have been — is all in Postgres and arrives
// in one request. Whether the server actually answers, and how many databases
// are on it, means connecting to another host; that is a second request per
// card, and until it lands the card says so rather than guessing.

function TargetCard({
  summary,
  live,
  checking,
  checkError,
}: {
  summary: BackupTargetSummary;
  // Undefined until this target's live check comes back — or for good, if it
  // failed. Every field it would carry is rendered as unknown rather than as
  // zero, because "no databases" and "we haven't asked yet" are different
  // things to read on a backup page.
  live: BackupTargetLive | undefined;
  checking: boolean;
  // The check itself could not be made. Said out loud rather than shown as an
  // absence, because on this page silence looks like "nothing is wrong".
  checkError: Error | null;
}) {
  const { target, runs, azureConfigured } = summary;

  // Blob-only dumps land with the live check, so the count climbs once — from
  // what this app recorded to everything the container holds.
  const records = runs.total + (live?.archived.length ?? 0);
  const last = newerTimestamp(runs.last, live?.archived[0]?.timestamp);
  // The one misconfiguration that hides itself: a target that can be read but
  // has nowhere to put a dump. Only worth saying once the server has answered —
  // a target nothing can reach has a larger problem.
  const missingDestination = live?.status.reachable && !azureConfigured;

  return (
    <Link href={`/backups/${target.id}`} className="block">
      {/* Hover shifts the border, not the shadow — the design's interaction rule,
          same as the project cards. */}
      <Card className="h-full rounded-lg shadow-none transition-colors hover:border-input">
        <CardHeader className="gap-2 pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="min-w-0 font-display text-headline-md tracking-normal">
              <span className="block truncate">{target.name || target.dbHost}</span>
            </CardTitle>
            {/* A run in flight is our own rows, so it is known immediately;
                "Ready" and "Unreachable" both wait for the server to answer. */}
            {runs.isRunning ? (
              <span className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS.info)}>Backing up</span>
            ) : live ? (
              <span
                className={cn(
                  STATUS_PILL_CLASS,
                  STATUS_TONE_CLASS[live.status.reachable ? 'success' : 'danger']
                )}
                title={live.status.error || undefined}
              >
                {live.status.reachable ? 'Ready' : 'Unreachable'}
              </span>
            ) : checkError ? (
              <span
                className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS.warning)}
                title={checkError.message}
              >
                Check failed
              </span>
            ) : (
              <span
                className={cn(
                  STATUS_PILL_CLASS,
                  'border border-border text-muted-foreground',
                  checking && 'animate-pulse'
                )}
              >
                {checking ? 'Checking' : 'Not checked'}
              </span>
            )}
          </div>
          <p className="flex items-center gap-1.5 truncate font-mono text-label-mono text-muted-foreground">
            <Database className="size-3.5 shrink-0" />
            <span className="truncate">{target.dbHost || '—'}</span>
            {/* Which server this is, in one word. Two cards that both say "Ready"
                over an IP address are otherwise indistinguishable, and a
                Postgres dump and a MySQL dump are not interchangeable. */}
            <span className="shrink-0 text-muted-foreground/70">
              · {BACKUP_ENGINE_DETAILS[target.engine].label}
            </span>
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              {/* In words, like the target page's header — the expression is
                  detail the card doesn't need. */}
              <span>{describeCron(target.cronSchedule)}</span>
              {target.scheduleEnabled ? 'scheduled' : 'off'}
            </span>
            <span className="inline-flex items-center gap-1.5 truncate">
              <Cloud className="size-3.5 shrink-0" />
              <span className="truncate font-mono text-label-mono">
                {target.storageContainer || 'no destination'}
              </span>
            </span>
          </div>

          {/* Counts as chips, the same treatment the project card gives
              "3 environments" — mono, `rounded-sm`, on the muted fill — so the
              two grids read as one system. The two problem counts only appear
              when they are not zero, and carry their own tone. */}
          <div className="flex flex-wrap items-center gap-1">
            <Badge
              variant="outline"
              className={cn(
                'rounded-sm bg-muted/50 px-1.5 font-mono text-label-mono font-medium text-muted-foreground',
                checking && 'animate-pulse'
              )}
            >
              <Database className="size-3" />
              {live?.status.reachable ? `${countDatabases(live.databases)} ` : '— '}
              database{live && countDatabases(live.databases) === 1 ? '' : 's'}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-sm bg-muted/50 px-1.5 font-mono text-label-mono font-medium text-muted-foreground"
            >
              <Archive className="size-3" />
              {records} backup{records === 1 ? '' : 's'}
            </Badge>
            {runs.failed ? (
              <Badge
                variant="outline"
                className="rounded-sm bg-tone-danger px-1.5 font-mono text-label-mono font-medium text-tone-danger-fg"
              >
                {runs.failed} failed
              </Badge>
            ) : null}
          </div>

          <p className="text-body-sm text-muted-foreground">
            Last backup:{' '}
            <span className="font-mono text-label-mono text-foreground">
              {last ? formatTimestamp(last) : 'none yet'}
            </span>
          </p>

          {/* Surfaced because it is silent: nothing fails until a run tries to
              upload and finds nowhere to put the dump. */}
          {missingDestination ? (
            <Badge
              variant="outline"
              className="rounded-sm bg-tone-warning text-label-caps uppercase text-tone-warning-fg"
            >
              <AlertTriangle className="size-3" />
              No Azure destination
            </Badge>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export function BackupsIndex({ role }: { role: UserRole }) {
  // One gate for the whole tab: a target holds a database password and its
  // dumps are the database contents, so there is no "edit it but don't run it"
  // middle ground worth modelling. Everyone else reads.
  const canManage = isAdmin(role);

  const { data: summaries, isLoading, error } = useBackupTargets();
  const targets = summaries ?? [];

  // One outbound check per card, in parallel, under the same query keys the
  // target page uses — so opening a card shows what the card already knew.
  const live = useBackupTargetsLive(targets.map((summary) => summary.target.id));
  const stats = computeBackupStats(targets, live.byTarget);

  return (
    <>
      <PageHeader
        title="Backups"
        stats={
          <>
            <span>
              Targets: <b className="text-foreground">{stats.targets}</b>
            </span>
            {stats.unreachable ? (
              <span>
                Unreachable: <b className="text-destructive">{stats.unreachable}</b>
              </span>
            ) : null}
            <span>
              Recent backups: <b className="text-foreground">{stats.records}</b>
            </span>
            {stats.failed ? (
              <span>
                Failed: <b className="text-destructive">{stats.failed}</b>
              </span>
            ) : null}

            {stats.latest ? (
              <span>
                Last: <b className="text-foreground">{formatTimestamp(stats.latest)}</b>
              </span>
            ) : null}
          </>
        }
        actions={
          canManage ? (
            <>
              {/* Azure storage is configured once for every target, so it is a
                  page-level action rather than a field in the target form. */}
              <BackupStorageDialog
                canManage={canManage}
                trigger={
                  <Button size="sm" variant="outline">
                    <Cloud className="mr-2 h-4 w-4" /> Azure Storage
                  </Button>
                }
              />
              <BackupTargetDialog
                canManage={canManage}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" /> Add Target
                  </Button>
                }
              />
            </>
          ) : (
            <span className="rounded-sm border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Read-only
            </span>
          )
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-body-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load backup targets.'}
          </p>
        ) : targets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center text-body-sm text-muted-foreground">
            No backup targets yet.
            {canManage ? (
              <span className="mt-1 block">
                Add a MySQL server, its Azure destination and a schedule.
              </span>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {targets.map((summary) => (
              <TargetCard
                key={summary.target.id}
                summary={summary}
                live={live.byTarget.get(summary.target.id)}
                checking={live.pending.has(summary.target.id)}
                checkError={(live.errors.get(summary.target.id) as Error | null) ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
