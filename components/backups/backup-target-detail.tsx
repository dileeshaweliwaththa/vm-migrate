'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, Database, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';
import { STATUS_PILL_CLASS, STATUS_TONE_CLASS } from '@/lib/vm-utils';
import { formatTimestamp, hasDuplicateSchedule, hasHostMismatch } from '@/lib/backup-utils';
import {
  useBackupLogs,
  useBackupTarget,
  useDeleteBackupTarget,
  useRunBackup,
  useSetWorkerCron,
} from '@/hooks/backups/useBackups';
import { useBackupStream } from '@/hooks/backups/useBackupStream';
import { BackupDatabasePicker } from '@/components/backups/backup-database-picker';
import { BackupHistory } from '@/components/backups/backup-history';
import { BackupLogPanel } from '@/components/backups/backup-log-panel';
import { BackupStatCards } from '@/components/backups/backup-stat-cards';
import { BackupTargetDialog } from '@/components/backups/backup-target-dialog';

// One backup target's page.
//
// Two views, switched in place — the same `ToggleGroup` pattern the project page
// uses for Environments / Documentation:
//
//   Overview — the numbers, what to dump, and the live log
//   History  — every recorded dump, grouped by day
//
// They were one page, and the history's nine columns under everything else made
// it a scroll rather than a screen.
//
// The header carries the two facts you need to know you are in the right place —
// the database and the schedule — and nothing else. Retention, the Azure
// destination, the worker's address and which credentials are stored are all
// *configuration*: they live in the strip at the bottom of Overview and in the
// Edit dialog, rather than in a sentence across the top of every visit.

export function BackupTargetDetail({
  targetId,
  canEdit,
  canPurge,
}: {
  targetId: string;
  canEdit: boolean;
  // Admin. Gates the schedule, deleting a dump, removing the target, and the
  // worker's own cron.
  canPurge: boolean;
}) {
  const { data: overview, isLoading, error } = useBackupTarget(targetId);
  const run = useRunBackup();
  const setWorkerCron = useSetWorkerCron();
  const removeTarget = useDeleteBackupTarget();
  const router = useRouter();

  const [view, setView] = useState<'overview' | 'history'>('overview');
  // Which databases the next manual run covers. Empty means all — the worker's
  // own default for a missing list, so nothing has to be selected to do the
  // usual thing.
  const [selected, setSelected] = useState<string[]>([]);

  // Follow the log while a run is in flight — one started here, or one the worker
  // reports (the Supabase schedule, or somebody else's manual run).
  const following = run.isPending || Boolean(overview?.status.isBackupRunning);

  // Two sources, because the worker has two and only one of them is reliable:
  //
  //   * the **stream** pushes each step as it happens — this is what a running
  //     backup actually shows;
  //   * the **persisted log** is a replay for a page opened mid-run, written
  //     fire-and-forget into the worker's own MySQL, so it is often empty.
  //
  // The replay seeds the panel and the stream appends to it. The stream stays
  // attached while the worker is reachable rather than only while a run is in
  // flight, so a nightly run that starts with this page open fills in by itself.
  const { data: logs } = useBackupLogs(targetId, following);
  const { events: streamed, connected } = useBackupStream(
    targetId,
    Boolean(overview?.status.reachable)
  );

  // Replay first, live lines after. Their sequence numbers are independent, so
  // the key is namespaced per source.
  const lines = [
    ...(logs?.events ?? []).map((event) => ({ ...event, seq: -event.seq - 1 })),
    ...streamed,
  ];

  const report = (result: { ok: boolean; message: string }) =>
    result.ok ? toast.success(result.message) : toast.error(result.message);
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : 'Something went wrong.');

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[100rem] space-y-4 px-4 py-8 sm:px-8">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (error || !overview) {
    return (
      <div className="mx-auto w-full max-w-[100rem] px-4 py-8 sm:px-8">
        <p className="text-body-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load this backup target.'}
        </p>
      </div>
    );
  }

  const { target, status, databases, records, lastDispatch } = overview;
  const warnings = [hasDuplicateSchedule(overview), hasHostMismatch(overview)];

  return (
    <>
      <PageHeader
        title={target.name || target.dbHost}
        stats={
          <>
            <span className="inline-flex items-center gap-1.5">
              <Database className="size-3.5" />
              <span className="font-mono text-label-mono">{target.dbHost || '—'}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              <span className="font-mono text-label-mono">{target.cronSchedule || '—'}</span>
              {target.scheduleEnabled ? 'scheduled' : 'not scheduled'}
            </span>
          </>
        }
        actions={
          <>
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
                  : 'Worker online'
                : 'Worker unreachable'}
            </span>
            {canEdit ? (
              <BackupTargetDialog
                target={target}
                canAdmin={canPurge}
                trigger={
                  <Button size="sm" variant="outline">
                    <Pencil className="mr-2 size-4" /> Edit
                  </Button>
                }
              />
            ) : null}
            {canPurge ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" aria-label="Remove target">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove “{target.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The stored credentials and the schedule are deleted, and this database stops
                      being backed up. No existing dump is removed — they live on the worker&apos;s
                      host and in Azure.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        removeTarget.mutate(target.id, {
                          onSuccess: () => {
                            toast.success('Backup target removed.');
                            router.push('/backups');
                          },
                          onError: fail,
                        })
                      }
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </>
        }
      />

      {/* Wider than the `max-w-7xl` the first cut used: `PageHeader` runs to the
          page's own padding, so a narrower body left a gutter on both sides that
          read as a mistake — and the history's nine columns want the room. */}
      <div className="mx-auto w-full max-w-[100rem] space-y-4 px-4 py-8 sm:px-8">
        {/* `ToggleGroup`, not `ui/tabs` — the generated tabs primitive styles on
            Radix 2.x boolean attributes 1.4.3 never emits and renders as an empty
            block (docs/ui-guidelines.md). Same control as the project page's. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as 'overview' | 'history')}
            className="gap-1 rounded-sm border border-border bg-muted p-1"
          >
            <ToggleGroupItem
              value="overview"
              className="rounded-sm px-3 text-body-sm data-[state=on]:bg-card data-[state=on]:font-medium data-[state=on]:text-foreground"
            >
              Overview
            </ToggleGroupItem>
            <ToggleGroupItem
              value="history"
              className="rounded-sm px-3 text-body-sm data-[state=on]:bg-card data-[state=on]:font-medium data-[state=on]:text-foreground"
            >
              History
              <span className="font-mono text-label-mono text-muted-foreground">
                {records.length}
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Warnings show on both views: they are the reason you came, whichever
            tab you land on. */}
        {!status.reachable ? (
          <p className="rounded-md bg-tone-danger px-3 py-2 text-body-sm text-tone-danger-fg">
            {status.error || 'The worker could not be reached.'}
          </p>
        ) : null}
        {warnings[0] ? (
          <p className="flex items-start gap-1.5 rounded-md bg-tone-warning px-3 py-2 text-body-sm text-tone-warning-fg">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            The worker&apos;s own cron is also on ({status.cronSchedule || 'unknown schedule'}) —
            these dumps will run twice. Turn it off under Configuration.
          </p>
        ) : null}
        {warnings[1] ? (
          <p className="flex items-start gap-1.5 rounded-md bg-tone-warning px-3 py-2 text-body-sm text-tone-warning-fg">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            The worker is backing up <span className="font-mono">{status.host}</span>, not{' '}
            <span className="font-mono">{target.dbHost}</span> — its own environment still wins
            until it reads this configuration.
          </p>
        ) : null}

        {view === 'overview' ? (
          <>
            <BackupStatCards overview={overview} />

            {canEdit && status.reachable ? (
              <BackupDatabasePicker
                databases={databases}
                selected={selected}
                onSelectedChange={setSelected}
                running={following}
                disabled={following}
                onRun={() =>
                  run.mutate(
                    { id: target.id, databases: selected },
                    {
                      onSuccess: (result) => {
                        report(result);
                        // The selection was for that run; leaving it ticked would
                        // silently narrow the next one.
                        if (result.ok) setSelected([]);
                      },
                      onError: fail,
                    }
                  )
                }
              />
            ) : null}

            <BackupLogPanel events={lines} running={following} connected={connected} />

            {/* Configuration, quietly, at the end — the facts you set once and
                then only check. Everything here is editable in the dialog above;
                this is the read-back. */}
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-label-caps uppercase text-muted-foreground">Configuration</p>
              <dl className="grid gap-3 text-body-sm sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Connects as</dt>
                  <dd className="truncate font-mono text-label-mono" title={target.dbHost}>
                    {target.dbUser || '—'}
                    {target.dbPort && target.dbPort !== 3306 ? `:${target.dbPort}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Worker</dt>
                  <dd className="truncate font-mono text-label-mono">
                    {target.workerUrl.replace(/^https?:\/\//, '')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Azure</dt>
                  <dd className="truncate font-mono text-label-mono">
                    {target.azureContainer
                      ? `${target.azureAccount ? `${target.azureAccount}/` : ''}${target.azureContainer}`
                      : 'not configured'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Retention</dt>
                  <dd className="font-mono text-label-mono">{target.retentionDays} days</dd>
                </div>
                <div>
                  {/* Which credentials are on file — never the values. */}
                  <dt className="text-muted-foreground">Credentials</dt>
                  <dd className="text-body-sm">
                    {target.hasDbPassword ? 'DB password' : 'no DB password'}
                    {' · '}
                    {target.hasAzureConnection ? 'Azure key' : 'no Azure key'}
                  </dd>
                </div>
                <div>
                  {/* When a run was last *asked for*, which the worker's own
                      history cannot tell us — a schedule that stopped firing
                      looks like a schedule with nothing to do. */}
                  <dt className="text-muted-foreground">Last dispatch</dt>
                  <dd
                    className="truncate font-mono text-label-mono"
                    title={lastDispatch?.error || undefined}
                  >
                    {lastDispatch
                      ? `${formatTimestamp(lastDispatch.createdAt)} · ${lastDispatch.source}${
                          lastDispatch.status === 'failed' ? ' · failed' : ''
                        }`
                      : target.scheduleEnabled
                        ? 'never'
                        : '—'}
                  </dd>
                </div>
              </dl>

              {/* The worker's own scheduler, which is not the schedule any more —
                  it is here so it can be switched off. */}
              {canPurge && status.reachable ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Toggle
                    variant="outline"
                    size="sm"
                    pressed={status.cronEnabled}
                    disabled={setWorkerCron.isPending}
                    onPressedChange={(next) =>
                      setWorkerCron.mutate(
                        { id: target.id, enabled: next },
                        { onSuccess: report, onError: fail }
                      )
                    }
                    aria-label="The worker's own cron"
                  >
                    <CalendarClock className="mr-1.5 size-4" />
                    {status.cronEnabled ? 'Worker cron on' : 'Worker cron off'}
                  </Toggle>
                  <span className="text-body-sm text-muted-foreground">
                    Leave off — Supabase runs the schedule.
                  </span>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <BackupHistory
            targetId={target.id}
            records={records}
            canEdit={canEdit}
            canPurge={canPurge}
          />
        )}
      </div>
    </>
  );
}
