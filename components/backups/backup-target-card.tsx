'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarClock,
  Cloud,
  CloudOff,
  Database,
  KeyRound,
  Pencil,
  Server,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
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
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASS } from '@/lib/vm-utils';
import {
  formatTimestamp,
  hasDuplicateSchedule,
  hasHostMismatch,
} from '@/lib/backup-utils';
import {
  useBackupLogs,
  useDeleteBackupTarget,
  useRunBackup,
  useSetWorkerCron,
} from '@/hooks/backups/useBackups';
import type { BackupTargetOverview } from '@/types/common/backup';
import { BackupDatabasePicker } from '@/components/backups/backup-database-picker';
import { BackupHistoryTable } from '@/components/backups/backup-history-table';
import { BackupLogPanel } from '@/components/backups/backup-log-panel';
import { BackupStatCards } from '@/components/backups/backup-stat-cards';
import { BackupTargetDialog } from '@/components/backups/backup-target-dialog';

// One backup target: the database it dumps, where the dumps go, when it runs,
// what it has done, and the controls to make it run now.

export function BackupTargetCard({
  overview,
  canEdit,
  canPurge,
}: {
  overview: BackupTargetOverview;
  canEdit: boolean;
  canPurge: boolean;
}) {
  const { target, status, databases, records, lastDispatch } = overview;
  // Which databases the next manual run covers. Empty means all — the worker's
  // own default for a missing list, so nothing has to be selected to do the
  // usual thing.
  const [selected, setSelected] = useState<string[]>([]);

  const run = useRunBackup();
  const setWorkerCron = useSetWorkerCron();
  const removeTarget = useDeleteBackupTarget();

  // Follow the log while a run is in flight — one started here, or one the
  // worker reports (the Supabase schedule, or somebody else's manual run).
  const following = run.isPending || status.isBackupRunning;
  const { data: logs } = useBackupLogs(target.id, following);

  const report = (result: { ok: boolean; message: string }) =>
    result.ok ? toast.success(result.message) : toast.error(result.message);
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : 'Something went wrong.');

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="font-display text-headline-md tracking-normal">
              {target.name || target.dbHost || target.workerUrl}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
              {/* The database server is the target's identity, so it leads. */}
              <span className="inline-flex items-center gap-1.5 font-mono text-label-mono">
                <Database className="size-3.5" />
                {target.dbUser ? `${target.dbUser}@` : ''}
                {target.dbHost || '—'}
                {target.dbPort && target.dbPort !== 3306 ? `:${target.dbPort}` : ''}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-label-mono">
                <Server className="size-3.5" />
                {target.workerUrl.replace(/^https?:\/\//, '')}
              </span>
              {/* Which credentials are on file — never the values. */}
              <span className="inline-flex items-center gap-1.5">
                <KeyRound className="size-3.5" />
                {target.hasDbPassword ? 'DB password stored' : 'no DB password'}
                {' · '}
                {target.hasAzureConnection ? 'Azure key stored' : 'no Azure key'}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* Reachability first, as text: everything else about the worker is
                unknown rather than false when the host is down. */}
            <span
              className={cn(
                'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                STATUS_TONE_CLASS[
                  status.reachable ? (status.isBackupRunning ? 'info' : 'success') : 'danger'
                ]
              )}
              title={status.error || undefined}
            >
              {status.reachable
                ? status.isBackupRunning
                  ? 'Running'
                  : 'Worker online'
                : 'Worker unreachable'}
            </span>
            {canEdit ? (
              <BackupTargetDialog
                target={target}
                canAdmin={canPurge}
                trigger={
                  <Button size="icon-sm" variant="ghost" title="Edit" aria-label="Edit target">
                    <Pencil className="size-4" />
                  </Button>
                }
              />
            ) : null}
            {canPurge ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    title="Remove target"
                    aria-label="Remove target"
                  >
                    <Trash2 className="size-4" />
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
                          onSuccess: () => toast.success('Backup target removed.'),
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm text-muted-foreground">
          {/* The Supabase schedule — this row *is* the schedule, so it is shown
              whether or not the worker can be reached. */}
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-3.5" />
            <span className="font-mono text-label-mono">{target.cronSchedule || '—'}</span>
            <span>{target.scheduleEnabled ? 'scheduled (Supabase)' : 'not scheduled'}</span>
          </span>
          {target.azureContainer ? (
            <span className="inline-flex items-center gap-1.5">
              {status.reachable && !status.azureEnabled ? (
                <>
                  <CloudOff className="size-3.5" />
                  Azure configured here, off in the worker
                </>
              ) : (
                <>
                  <Cloud className="size-3.5" />
                  {target.azureAccount ? `${target.azureAccount}/` : ''}
                  <span className="font-mono text-label-mono">{target.azureContainer}</span>
                </>
              )}
            </span>
          ) : null}
          <span>
            Keeps <b className="text-foreground">{target.retentionDays}</b> days
          </span>
          {status.reachable ? (
            <span>
              Databases: <b className="text-foreground">{databases.length}</b>
            </span>
          ) : null}
          {lastDispatch ? (
            <span title={lastDispatch.error || undefined}>
              Last asked: <b className="text-foreground">{formatTimestamp(lastDispatch.createdAt)}</b>{' '}
              ({lastDispatch.source}
              {lastDispatch.status === 'failed' ? ', failed' : ''})
            </span>
          ) : target.scheduleEnabled ? (
            // An enabled schedule that has never fired is the finding, not the
            // absence of one.
            <span className="text-ink-accent">Scheduled, but never dispatched yet</span>
          ) : null}
        </div>

        {!status.reachable ? (
          <p className="text-body-sm text-destructive">
            {status.error || 'The worker could not be reached.'}
          </p>
        ) : null}

        {/* Two configurations that can quietly disagree, both worth naming. */}
        {hasDuplicateSchedule(overview) ? (
          <p className="inline-flex items-center gap-1.5 rounded-md bg-tone-warning px-3 py-2 text-body-sm text-tone-warning-fg">
            <AlertTriangle className="size-4 shrink-0" />
            The worker&apos;s own cron is also on ({status.cronSchedule || 'unknown schedule'}) —
            these dumps will run twice. Turn it off below.
          </p>
        ) : null}
        {hasHostMismatch(overview) ? (
          <p className="inline-flex items-center gap-1.5 rounded-md bg-tone-warning px-3 py-2 text-body-sm text-tone-warning-fg">
            <AlertTriangle className="size-4 shrink-0" />
            The worker is backing up <span className="font-mono">{status.host}</span>, not{' '}
            <span className="font-mono">{target.dbHost}</span> — its own environment still wins
            until it reads this configuration.
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* The four numbers first: how many dumps, when the last one was, how
            many databases, and whether the worker is up. */}
        <BackupStatCards overview={overview} />

        {canEdit && status.reachable ? (
          <BackupDatabasePicker
            databases={databases}
            selected={selected}
            onSelectedChange={setSelected}
            running={run.isPending || status.isBackupRunning}
            disabled={run.isPending || status.isBackupRunning}
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

        {/* Always present, so there is somewhere for a run to appear and
            somewhere to read the last one afterwards. */}
        <BackupLogPanel logs={logs} running={following} />

        <BackupHistoryTable
          targetId={target.id}
          records={records}
          canEdit={canEdit}
          canPurge={canPurge}
        />

        {/* The worker's *own* scheduler, which is not the schedule any more — it
            is here so it can be switched off. Below the history because it is
            configuration, not an everyday action. */}
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
              The worker&apos;s built-in scheduler. Leave it off — Supabase runs the schedule.
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
