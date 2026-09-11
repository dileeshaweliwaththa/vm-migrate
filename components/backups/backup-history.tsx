'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Download,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { STATUS_PILL_CLASS, STATUS_TONE_CLASS } from '@/lib/vm-utils';
import {
  formatBytes,
  formatDuration,
  formatTimestamp,
  groupRecordsByDay,
  recordLabel,
  recordTone,
} from '@/lib/backup-utils';
import {
  BACKUPS_QUERY_KEY,
  backupTargetQueryKey,
  useDeleteBackupRecord,
  useReuploadBackup,
} from '@/hooks/backups/useBackups';
import type { BackupDay } from '@/lib/backup-utils';
import type { BackupRecord } from '@/types/common/backup';

// A target's backup history, **grouped by day and collapsed**.
//
// The worker keeps its 200 most recent records and a nightly run covers eighteen
// databases, so a flat table is a fortnight of near-identical rows. A day
// collapses to one line — "Wed 13 May · 18 dumps · 214 MB · all uploaded" — which
// is the check you actually make; open it when it isn't all fine.
//
// Every day starts **open**; the chevron collapses one you are done with. The
// state therefore tracks which days are *closed* rather than which are open —
// seeding an open-set from the records was a bug as well as a default: it was
// computed on the first render, when the fetch had not resolved and there were no
// days yet, so nothing ever opened.

function StatusPill({ record }: { record: BackupRecord }) {
  return (
    <span
      className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS[recordTone(record)])}
      // The failure reason, where there is one — the pill stays scannable.
      title={record.error || record.azureError || undefined}
    >
      {recordLabel(record)}
    </span>
  );
}

function DayRows({
  day,
  targetId,
  canEdit,
  canPurge,
}: {
  day: BackupDay;
  targetId: string;
  canEdit: boolean;
  canPurge: boolean;
}) {
  const reupload = useReuploadBackup();
  const remove = useDeleteBackupRecord();

  const report = (result: { ok: boolean; message: string }) =>
    result.ok ? toast.success(result.message) : toast.error(result.message);
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : 'Something went wrong.');

  const showActions = canEdit || canPurge;

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[58rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Database</TableHead>
            <TableHead>Filename</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Azure</TableHead>
            {showActions ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {day.records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-medium">{record.database || '—'}</TableCell>
              {/* The worker's own filename — it carries the database and the
                  timestamp, and it is what you look for in Azure. */}
              <TableCell
                className="max-w-[16rem] truncate font-mono text-label-mono text-muted-foreground"
                title={record.filename || undefined}
              >
                {record.filename || '—'}
              </TableCell>
              <TableCell className="font-mono text-label-mono text-muted-foreground">
                {formatTimestamp(record.timestamp)}
              </TableCell>
              <TableCell className="font-mono text-label-mono">
                {formatBytes(record.size)}
              </TableCell>
              <TableCell className="font-mono text-label-mono text-muted-foreground">
                {formatDuration(record.duration)}
              </TableCell>
              <TableCell className="text-label-caps uppercase text-muted-foreground">
                {record.trigger}
              </TableCell>
              <TableCell>
                <StatusPill record={record} />
              </TableCell>
              <TableCell>
                {record.azureUploaded ? (
                  <span className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS.success)}>
                    Uploaded
                  </span>
                ) : (
                  // Two different absences: never tried (the dump failed) and
                  // tried but didn't land. The second is the one to act on.
                  <span
                    className="text-body-sm text-muted-foreground"
                    title={record.azureError || undefined}
                  >
                    {record.status === 'success' ? 'not uploaded' : '—'}
                  </span>
                )}
              </TableCell>
              {showActions ? (
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {/* Proxied through our API, not linked at the worker: it sits
                        on an internal address and its own API has no auth. */}
                    {canEdit ? (
                      <Button asChild size="icon-sm" variant="ghost" title="Download this dump">
                        <a
                          href={`/api/backups/${targetId}/records/${record.id}/download`}
                          aria-label={`Download ${record.filename}`}
                        >
                          <Download className="size-4" />
                        </a>
                      </Button>
                    ) : null}
                    {/* Only offered where it can do something: a dump that
                        succeeded locally but never reached Azure. */}
                    {canEdit && record.status === 'success' && !record.azureUploaded ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Upload this backup to Azure"
                        aria-label={`Upload ${record.filename} to Azure`}
                        disabled={reupload.isPending}
                        onClick={() =>
                          reupload.mutate(
                            { id: targetId, recordId: record.id },
                            { onSuccess: report, onError: fail }
                          )
                        }
                      >
                        <CloudUpload className="size-4" />
                      </Button>
                    ) : null}
                    {canPurge ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            title="Delete this backup"
                            aria-label={`Delete ${record.filename}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this backup?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {record.filename || 'This dump'} is deleted on the backup host and
                              cannot be recovered from here.
                              {record.azureUploaded
                                ? ' The copy already in Azure Blob Storage is left alone.'
                                : ' There is no Azure copy of it.'}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                remove.mutate(
                                  { id: targetId, recordId: record.id },
                                  { onSuccess: report, onError: fail }
                                )
                              }
                            >
                              Delete backup
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function BackupHistory({
  targetId,
  records,
  canEdit,
  canPurge,
}: {
  targetId: string;
  records: BackupRecord[];
  canEdit: boolean;
  canPurge: boolean;
}) {
  const queryClient = useQueryClient();
  const days = groupRecordsByDay(records);

  // Which days the reader has collapsed. Empty — the initial state — means every
  // day is open, so a day that arrives from a later fetch is open too, with no
  // state to seed from data that hasn't loaded yet.
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Two shortcuts, because thirteen days of chevrons is not a way to tidy up.
  const collapseAll = () => setClosed(new Set(days.map((day) => day.key)));
  const expandAll = () => setClosed(new Set());

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label-caps uppercase text-muted-foreground">Backup history</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-label-mono text-muted-foreground">
            {records.length} record{records.length === 1 ? '' : 's'} · {days.length} day
            {days.length === 1 ? '' : 's'}
          </span>
          {/* The history lives on the worker, so "refresh" means re-read it. Both
              query keys: the card came from one of them, this page from the
              other. */}
          {days.length > 1 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={closed.size ? expandAll : collapseAll}
              title={closed.size ? 'Open every day' : 'Collapse every day'}
            >
              {closed.size ? 'Expand all' : 'Collapse all'}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: backupTargetQueryKey(targetId) });
              queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY });
            }}
            title="Re-read the history from the worker"
          >
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-body-sm text-muted-foreground">
          No backups recorded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {days.map((day) => {
            const isOpen = !closed.has(day.key);
            return (
              <div key={day.key} className="overflow-hidden rounded-lg border border-border">
                {/* The day line: everything you need to not open it. */}
                {/* A grid, not a flex row: with flex, each day's date set the x
                    where "18 dumps" began, so no two day lines agreed on a
                    column. Fixed tracks make the four values read straight down
                    the stack. */}
                <button
                  type="button"
                  onClick={() => toggle(day.key)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted sm:grid-cols-[1rem_13rem_7rem_6rem_minmax(0,1fr)]"
                >
                  {isOpen ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate font-medium">{day.label}</span>
                  {/* Tabular figures so the counts and sizes line up digit for
                      digit, not just column for column. */}
                  <span className="font-mono text-label-mono tabular-nums text-muted-foreground">
                    {day.records.length} dump{day.records.length === 1 ? '' : 's'}
                  </span>
                  <span className="font-mono text-label-mono tabular-nums text-muted-foreground">
                    {formatBytes(day.totalSize)}
                  </span>
                  {/* The day's verdict, as a word. Green only when every dump
                      succeeded *and* every one reached Azure. */}
                  <span className="justify-self-start">
                    {day.failed ? (
                      <span
                        className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS.danger)}
                      >
                        {day.failed} failed
                      </span>
                    ) : day.localOnly ? (
                      <span
                        className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS.warning)}
                      >
                        {day.localOnly} local only
                      </span>
                    ) : (
                      <span
                        className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS.success)}
                      >
                        All uploaded
                      </span>
                    )}
                  </span>
                </button>

                {isOpen ? (
                  <DayRows day={day} targetId={targetId} canEdit={canEdit} canPurge={canPurge} />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
