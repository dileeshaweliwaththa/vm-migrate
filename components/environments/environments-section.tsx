'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ExternalLink, ListChecks, Pencil, Play, Plus, RefreshCw, Server, Settings2, Trash2 } from 'lucide-react';
import type { Environment, EnvironmentPort, ProjectDetail } from '@/types/common/project';
import type { JenkinsJobSummary } from '@/types/common/jenkins';
import { useEnvironmentMutations } from '@/hooks/environments/useEnvironments';
import { useTriggerJenkinsBuild, useJenkinsJobs } from '@/hooks/environments/useEnvironmentJenkins';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { JenkinsStatusBadge } from '@/components/environments/jenkins-status';
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
import { EnvironmentForm } from '@/components/environments/environment-form';
import { JenkinsConfigDialog } from '@/components/environments/jenkins-config-dialog';
import { JenkinsJobsDialog } from '@/components/environments/jenkins-jobs-dialog';

export function EnvironmentsSection({
  project,
  canEdit,
}: {
  project: ProjectDetail;
  canEdit: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Environments</h2>
        {canEdit ? (
          <EnvironmentForm
            projectId={project.id}
            trigger={
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> Add Environment
              </Button>
            }
          />
        ) : null}
      </div>

      {project.environments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No environments yet.
        </div>
      ) : (
        <div className="space-y-4">
          {project.environments.map((env) => (
            <EnvironmentCard key={env.id} projectId={project.id} env={env} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}

// The last build cell content (# + local time), or a dash.
function LastBuild({ job }: { job?: JenkinsJobSummary }) {
  if (!job?.lastBuildNumber) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-xs text-muted-foreground">
      #{job.lastBuildNumber}
      {job.lastBuildAt ? <span className="block">{new Date(job.lastBuildAt).toLocaleString()}</span> : null}
    </span>
  );
}

// A single record row: Port · URL · Status · Last build (+ Run/Delete). Status
// and last build come live from Jenkins (matched by job URL); the port is
// editable inline so it can be filled in later.
function PortRow({
  projectId,
  env,
  port,
  canEdit,
  job,
}: {
  projectId: string;
  env: Environment;
  port: EnvironmentPort;
  canEdit: boolean;
  job?: JenkinsJobSummary;
}) {
  const { updatePort, removePort } = useEnvironmentMutations(projectId);
  const trigger = useTriggerJenkinsBuild(projectId, env.id);
  const [portVal, setPortVal] = useState(port.port);
  const [descVal, setDescVal] = useState(port.description);

  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed.');
  const save = (input: Parameters<typeof updatePort.mutate>[0]['input']) =>
    updatePort.mutate({ envId: env.id, portId: port.id, input }, { onError });

  const status = job ? (
    <JenkinsStatusBadge status={job.status} building={job.building} />
  ) : (
    <span className="text-muted-foreground">—</span>
  );

  // URL cell: for a Jenkins record, a link to the job (labelled by description);
  // for a manual record, the editable description/label.
  const urlCell = port.jenkinsJobUrl ? (
    <a
      href={port.jenkinsJobUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      {port.description || port.jenkinsJobUrl}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  ) : canEdit ? (
    <Input
      value={descVal}
      onChange={(e) => setDescVal(e.target.value)}
      onBlur={() => descVal !== port.description && save({ description: descVal })}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="Description / URL"
      className="h-8"
    />
  ) : (
    <span className="text-muted-foreground">{port.description || '—'}</span>
  );

  return (
    <TableRow>
      <TableCell>
        {canEdit ? (
          <Input
            value={portVal}
            onChange={(e) => setPortVal(e.target.value)}
            onBlur={() => portVal !== port.port && save({ port: portVal })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="port"
            className="h-8 w-20 font-mono"
          />
        ) : (
          <span className="font-mono">{port.port || '—'}</span>
        )}
      </TableCell>
      <TableCell>{urlCell}</TableCell>
      <TableCell>{status}</TableCell>
      <TableCell>
        <LastBuild job={job} />
      </TableCell>
      {canEdit ? (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {port.jenkinsJobUrl ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Run build"
                title="Run build"
                onClick={() =>
                  trigger.mutate(port.jenkinsJobUrl, {
                    onSuccess: (msg) => toast.success(msg),
                    onError,
                  })
                }
                disabled={trigger.isPending}
              >
                <Play className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete record"
              onClick={() => removePort.mutate({ envId: env.id, portId: port.id }, { onError })}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function EnvironmentCard({
  projectId,
  env,
  canEdit,
}: {
  projectId: string;
  env: Environment;
  canEdit: boolean;
}) {
  const { removeEnvironment, addPort, syncFromJenkins } = useEnvironmentMutations(projectId);
  const [port, setPort] = useState('');
  const [description, setDescription] = useState('');
  const [jenkinsOpen, setJenkinsOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const isJenkins = env.cicdProvider === 'jenkins';

  // Live Jenkins status/last-build for records that link a job — fetched once
  // per card (only when there are jenkins-linked records) and matched by URL.
  const hasJenkinsRecords = env.ports.some((p) => p.jenkinsJobUrl);
  const { data: jenkinsJobs } = useJenkinsJobs(projectId, env.id, hasJenkinsRecords);
  const jobByUrl = useMemo(() => {
    const map = new Map<string, JenkinsJobSummary>();
    for (const j of jenkinsJobs ?? []) map.set(j.url, j);
    return map;
  }, [jenkinsJobs]);

  const handleSyncJenkins = () => {
    syncFromJenkins.mutate(env.id, {
      onSuccess: (r) => toast.success(r.message),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Jenkins sync failed.'),
    });
  };

  const handleAddPort = () => {
    if (!port.trim()) return;
    addPort.mutate(
      { envId: env.id, input: { port, protocol: 'HTTPS', description, position: env.ports.length } },
      {
        onSuccess: () => {
          setPort('');
          setDescription('');
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add port.'),
      }
    );
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{env.name || 'unnamed'}</span>
          <Badge variant="secondary" className="uppercase">
            {env.cicdProvider}
          </Badge>
          {env.vmName ? (
            <Link
              href="/tracker"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Server className="h-3 w-3" /> {env.vmName}
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {env.jenkinsUrl ? (
            <a
              href={env.jenkinsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Jenkins <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {env.deployUrl ? (
            <a
              href={env.deployUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Live <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {canEdit ? (
            <>
              {isJenkins ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Jenkins settings"
                    title="Jenkins settings"
                    onClick={() => setJenkinsOpen(true)}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  {env.jenkinsUrl ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Browse Jenkins jobs"
                        title="Browse Jenkins jobs & run builds"
                        onClick={() => setJobsOpen(true)}
                      >
                        <ListChecks className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Sync ports from Jenkins"
                        title="Sync ports from Jenkins"
                        onClick={handleSyncJenkins}
                        disabled={syncFromJenkins.isPending}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${syncFromJenkins.isPending ? 'animate-spin' : ''}`}
                        />
                      </Button>
                    </>
                  ) : null}
                  <JenkinsConfigDialog
                    projectId={projectId}
                    envId={env.id}
                    envName={env.name}
                    open={jenkinsOpen}
                    onOpenChange={setJenkinsOpen}
                  />
                  {env.jenkinsUrl ? (
                    <JenkinsJobsDialog
                      projectId={projectId}
                      envId={env.id}
                      envName={env.name}
                      open={jobsOpen}
                      onOpenChange={setJobsOpen}
                    />
                  ) : null}
                </>
              ) : null}
              <EnvironmentForm
                projectId={projectId}
                environment={env}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label="Edit environment">
                    <Pencil className="h-4 w-4" />
                  </Button>
                }
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete environment">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{env.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the environment and its ports. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        removeEnvironment.mutate(env.id, {
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : 'Failed to remove.'),
                        })
                      }
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Port</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-40">Last build</TableHead>
              {canEdit ? <TableHead className="w-20" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {env.ports.map((p) => (
              <PortRow
                key={p.id}
                projectId={projectId}
                env={env}
                port={p}
                canEdit={canEdit}
                job={p.jenkinsJobUrl ? jobByUrl.get(p.jenkinsJobUrl) : undefined}
              />
            ))}
            {env.ports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 5 : 4} className="text-center text-sm text-muted-foreground">
                  No records yet.
                </TableCell>
              </TableRow>
            ) : null}
            {canEdit ? (
              <TableRow>
                <TableCell>
                  <Input
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="3000"
                    className="h-8 w-20 font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Description / URL"
                    className="h-8"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPort()}
                  />
                </TableCell>
                <TableCell colSpan={3}>
                  <Button size="sm" variant="outline" onClick={handleAddPort} disabled={!port.trim()}>
                    <Plus className="mr-1 h-4 w-4" /> Add
                  </Button>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
