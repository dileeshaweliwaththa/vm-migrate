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
import { computeBackupStats, describeCron, formatTimestamp } from '@/lib/backup-utils';
import { useBackupTargets } from '@/hooks/backups/useBackups';
import type { UserRole } from '@/types/common';
import type { BackupTargetOverview } from '@/types/common/backup';
import { BackupStorageDialog } from '@/components/backups/backup-storage-dialog';
import { BackupTargetDialog } from '@/components/backups/backup-target-dialog';

// The Backups index: one card per target, each opening its own page.
//
// It used to be one long page with every target's stat cards, database picker,
// log panel and 200-row history stacked — which worked for exactly one target.
// Same two-level shape as Projects now: a grid you scan, and a page you work in.
//
// A card answers only "is this database being backed up, and is anything wrong":
// the worker's state, when the last dump was, the schedule, and the two
// misconfigurations that hide themselves (a second scheduler, a worker pointed at
// a different host).

function TargetCard({ overview }: { overview: BackupTargetOverview }) {
  const { target, status, databases, records } = overview;
  const latest = records[0] ?? null;
  const failed = records.filter((record) => record.status === 'failed').length;
  // The one misconfiguration that hides itself: a target that can be read but
  // has nowhere to put a dump.
  const missingDestination = status.reachable && !status.azureConfigured;

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
            <span
              className={cn(
                STATUS_PILL_CLASS,
                STATUS_TONE_CLASS[
                  status.reachable ? (status.isBackupRunning ? 'info' : 'success') : 'danger'
                ]
              )}
              title={status.error || undefined}
            >
              {status.reachable
                ? status.isBackupRunning
                  ? 'Backing up'
                  : 'Ready'
                : 'Unreachable'}
            </span>
          </div>
          <p className="flex items-center gap-1.5 truncate font-mono text-label-mono text-muted-foreground">
            <Database className="size-3.5 shrink-0" />
            {target.dbHost || '—'}
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
              className="rounded-sm bg-muted/50 px-1.5 font-mono text-label-mono font-medium text-muted-foreground"
            >
              <Database className="size-3" />
              {status.reachable ? databases.length : '—'} database
              {databases.length === 1 ? '' : 's'}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-sm bg-muted/50 px-1.5 font-mono text-label-mono font-medium text-muted-foreground"
            >
              <Archive className="size-3" />
              {records.length} backup{records.length === 1 ? '' : 's'}
            </Badge>
            {failed ? (
              <Badge
                variant="outline"
                className="rounded-sm bg-tone-danger px-1.5 font-mono text-label-mono font-medium text-tone-danger-fg"
              >
                {failed} failed
              </Badge>
            ) : null}

          </div>

          <p className="text-body-sm text-muted-foreground">
            Last backup:{' '}
            <span className="font-mono text-label-mono text-foreground">
              {latest ? formatTimestamp(latest.timestamp) : 'none yet'}
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

  const { data: overviews, isLoading, error } = useBackupTargets();
  const stats = computeBackupStats(overviews ?? []);

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
                Last: <b className="text-foreground">{formatTimestamp(stats.latest.timestamp)}</b>
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
        ) : (overviews ?? []).length === 0 ? (
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
            {(overviews ?? []).map((overview) => (
              <TargetCard key={overview.target.id} overview={overview} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
