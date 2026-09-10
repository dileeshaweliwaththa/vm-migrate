'use client';

import { toast } from 'sonner';
import { CloudUpload, Download, RefreshCw, Trash2 } from 'lucide-react';
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
import { STATUS_TONE_CLASS } from '@/lib/vm-utils';
import {
  formatBytes,
  formatDuration,
  formatTimestamp,
  recordLabel,
  recordTone,
} from '@/lib/backup-utils';
import {
  BACKUPS_QUERY_KEY,
  useDeleteBackupRecord,
  useReuploadBackup,
} from '@/hooks/backups/useBackups';
import { useQueryClient } from '@tanstack/react-query';
import type { BackupRecord } from '@/types/common/backup';

// One target's backup history. The worker caps it at its 200 most recent
// records, so this is the recent past rather than the whole archive.
//
// `canEdit` gates re-uploading a dump to Azure; `canPurge` (admin) gates deleting
// one. Deleting a backup is the only action on this page that can lose something
// you would want during an incident, which is why it sits with admin and behind
// a confirm.
export function BackupHistoryTable({
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
  const reupload = useReuploadBackup();
  const remove = useDeleteBackupRecord();
  const queryClient = useQueryClient();

  const report = (result: { ok: boolean; message: string }) =>
    result.ok ? toast.success(result.message) : toast.error(result.message);
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : 'Something went wrong.');

  const showActions = canEdit || canPurge;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label-caps uppercase text-muted-foreground">Recent backups</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-label-mono text-muted-foreground">
            {records.length} record{records.length === 1 ? '' : 's'}
          </span>
          {/* The history lives on the worker, so "refresh" means re-read it —
              which is the whole registry query, since one card's data comes from
              the same payload. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY })}
            title="Re-read the history from the worker"
          >
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
      </div>

      {records.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-body-sm text-muted-foreground">
          No backups recorded yet.
        </p>
      ) : (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="min-w-[64rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Database</TableHead>
            <TableHead>Filename</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Azure</TableHead>
            {showActions ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-medium">{record.database || '—'}</TableCell>
              {/* The worker's own filename — it carries the database and the
                  timestamp, and it is what you look for in Azure. Truncated with
                  the full value on hover rather than allowed to set the column's
                  width. */}
              <TableCell
                className="max-w-[18rem] truncate font-mono text-label-mono text-muted-foreground"
                title={record.filename || undefined}
              >
                {record.filename || '—'}
              </TableCell>
              {/* Mono for everything scanned down a column: times, sizes,
                  durations. */}
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
                <span
                  className={cn(
                    'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                    STATUS_TONE_CLASS[recordTone(record)]
                  )}
                  // The failure reason, where there is one — the pill itself
                  // stays short enough to scan.
                  title={record.error || record.azureError || undefined}
                >
                  {recordLabel(record)}
                </span>
              </TableCell>
              <TableCell>
                {record.azureUploaded ? (
                  <span
                    className={cn(
                      'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                      STATUS_TONE_CLASS.success
                    )}
                  >
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
                      <Button
                        asChild
                        size="icon-sm"
                        variant="ghost"
                        title="Download this dump"
                      >
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
      )}
    </div>
  );
}
