'use client';

import { ExternalLink } from 'lucide-react';
import { useJenkinsBuildHistory } from '@/hooks/environments/useEnvironmentJenkins';
import type { EnvironmentBuildRun } from '@/types/common/jenkins';
import { JenkinsRunBadge } from '@/components/environments/jenkins-status';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// How long a finished run took, from our own timestamps (Jenkins' duration isn't
// persisted here, and this also covers a run that never reached a build).
const duration = (run: EnvironmentBuildRun): string => {
  if (!run.finishedAt) return '—';
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (ms < 0) return '—';
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

// Build history: every build triggered from the app, who started it, and how it
// ended. Read-only and open to every role — running a build is open to viewers
// too, so the trail is what makes a run attributable.
//
// Scoped to one record by `portId`, which is how the records table opens it: each
// row has its own ▶ Run and its own history. Without a portId it covers the whole
// environment, and the Job column earns its place; with one, every row is the same
// job and the column is dropped.
export function JenkinsHistoryDialog({
  projectId,
  envId,
  title,
  portId = null,
  open,
  onOpenChange,
}: {
  projectId: string;
  envId: string;
  // What the history is *of* — a record's name, or the environment's.
  title: string;
  portId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: runs, isLoading, error } = useJenkinsBuildHistory(projectId, envId, portId, open);
  const columns = portId ? 5 : 6;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `sm:` prefix required — dialog.tsx's own `sm:max-w-sm` beats an
          unprefixed max-w-* here. The list scrolls itself rather than the
          dialog, which would displace the close button. */}
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Build history — {title}</DialogTitle>
          <DialogDescription>
            Builds started from this app, newest first, with the user who ran each one.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load the build history.'}
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  {portId ? null : <TableHead>Job</TableHead>}
                  <TableHead className="w-20">Build</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className={portId ? '' : 'w-[22%]'}>Started by</TableHead>
                  <TableHead className="w-44">Started</TableHead>
                  <TableHead className="w-20">Took</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs ?? []).map((run) => (
                  <TableRow key={run.id}>
                    {portId ? null : (
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{run.jobName || '—'}</span>
                          {run.jobUrl ? (
                            <a
                              href={run.jobUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Open job in Jenkins"
                            >
                              <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">
                      {run.buildNumber ? (
                        run.buildUrl ? (
                          <a
                            href={run.buildUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            #{run.buildNumber}
                          </a>
                        ) : (
                          `#${run.buildNumber}`
                        )
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <JenkinsRunBadge phase={run.phase} result={run.result} />
                    </TableCell>
                    <TableCell className="text-sm">{run.triggeredByLabel}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{duration(run)}</TableCell>
                  </TableRow>
                ))}
                {(runs ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No builds have been started from here yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
