'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Play, Search } from 'lucide-react';
import { useJenkinsJobs, useTriggerJenkinsBuild } from '@/hooks/environments/useEnvironmentJenkins';
import { useEnvironmentMutations } from '@/hooks/environments/useEnvironments';
import type { JenkinsJobSummary } from '@/types/common/jenkins';
import { JenkinsStatusBadge } from '@/components/environments/jenkins-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function JenkinsJobsDialog({
  projectId,
  envId,
  envName,
  open,
  onOpenChange,
}: {
  projectId: string;
  envId: string;
  envName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: jobs, isLoading, error } = useJenkinsJobs(projectId, envId, open);
  const trigger = useTriggerJenkinsBuild(projectId, envId);
  const { addPort } = useEnvironmentMutations(projectId);
  const [query, setQuery] = useState('');
  const [pendingRun, setPendingRun] = useState<JenkinsJobSummary | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs ?? [];
    return (jobs ?? []).filter(
      (j) => j.path.toLowerCase().includes(q) || j.description.toLowerCase().includes(q)
    );
  }, [jobs, query]);

  const handleRun = () => {
    if (!pendingRun) return;
    const job = pendingRun;
    setPendingRun(null);
    trigger.mutate(job.url, {
      onSuccess: (msg) => toast.success(msg),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to trigger build.'),
    });
  };

  // "Use" adds the job as a record in the environment's table (port and domain
  // left blank to fill later). Keeps the dialog open so several jobs can be added.
  //
  // The record is labelled by the job's *name* — the same value this list shows
  // in bold — not its Jenkins description, so the table and this dialog agree on
  // what a job is called. Folder-nested jobs fall back to the path, where the
  // bare name alone would be ambiguous.
  const handleUse = (job: JenkinsJobSummary) => {
    const label = job.name || job.path;
    addPort.mutate(
      {
        envId,
        input: {
          port: '',
          protocol: 'HTTPS',
          description: label,
          jenkinsJobUrl: job.url,
        },
      },
      {
        onSuccess: () => toast.success(`Added “${label}” — set its port and domain when ready.`),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add the record.'),
      }
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Jenkins jobs — {envName}</DialogTitle>
            <DialogDescription>
              All jobs on the server. Run a build, or use one as this environment&apos;s job.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Filter jobs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load Jenkins jobs.'}
            </p>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-40">Last build</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((job) => (
                    <TableRow key={job.url}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{job.path}</span>
                          <a href={job.url} target="_blank" rel="noreferrer" aria-label="Open in Jenkins">
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </a>
                        </div>
                        {job.description ? (
                          <p className="line-clamp-1 text-xs text-muted-foreground">{job.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <JenkinsStatusBadge status={job.status} building={job.building} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.lastBuildNumber ? (
                          <>
                            #{job.lastBuildNumber}
                            {job.lastBuildAt ? (
                              <span className="block">{new Date(job.lastBuildAt).toLocaleString()}</span>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Run build"
                            title="Run build"
                            onClick={() => setPendingRun(job)}
                            disabled={trigger.isPending}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => handleUse(job)}
                            disabled={addPort.isPending}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Use
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        {jobs && jobs.length > 0 ? 'No jobs match the filter.' : 'No jobs returned by Jenkins.'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingRun} onOpenChange={(o) => !o && setPendingRun(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run “{pendingRun?.path}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This triggers a real build on your Jenkins server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRun}>Run build</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
