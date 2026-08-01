'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Container,
  ExternalLink,
  History,
  ListChecks,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
} from 'lucide-react';
import type { Environment, EnvironmentPort, ProjectDetail } from '@/types/common/project';
import type { JenkinsJobSummary } from '@/types/common/jenkins';
import { useEnvironmentMutations } from '@/hooks/environments/useEnvironments';
import {
  useTriggerJenkinsBuild,
  useJenkinsJobs,
  useJenkinsRun,
} from '@/hooks/environments/useEnvironmentJenkins';
import { isTerminalRunPhase } from '@/types/common/jenkins';
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
import { JenkinsRunBadge, JenkinsStatusBadge } from '@/components/environments/jenkins-status';
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
import { JenkinsHistoryDialog } from '@/components/environments/jenkins-history-dialog';
import { DockerImportDialog } from '@/components/environments/docker-import-dialog';

// `canEdit` gates configuration (records, ports, credentials, deletes).
// `canBuild` gates running a job and seeing its history — true for every
// signed-in role, viewers included, because each run is recorded against the user
// who started it (see lib/rbac.ts and docs/jenkins-sync.md).
export function EnvironmentsSection({
  project,
  canEdit,
  canBuild,
}: {
  project: ProjectDetail;
  canEdit: boolean;
  canBuild: boolean;
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
            <EnvironmentCard
              key={env.id}
              projectId={project.id}
              env={env}
              canEdit={canEdit}
              canBuild={canBuild}
            />
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

// A single record row: Port · Name · Domain · Status · Last build (+ Run/Delete).
// Status and last build come live from Jenkins (matched by job URL); port, name,
// and domain are editable inline so they can be filled in later.
//
// Run is a `canBuild` action (viewers included); Delete is `canEdit`. Whether the
// actions column exists at all is the card's call — `showActions` — so the header
// and the cells can't disagree about the column count.
function PortRow({
  projectId,
  env,
  port,
  canEdit,
  canBuild,
  showActions,
  job,
}: {
  projectId: string;
  env: Environment;
  port: EnvironmentPort;
  canEdit: boolean;
  canBuild: boolean;
  showActions: boolean;
  job?: JenkinsJobSummary;
}) {
  const { updatePort, removePort } = useEnvironmentMutations(projectId);
  const trigger = useTriggerJenkinsBuild(projectId, env.id);
  const [portVal, setPortVal] = useState(port.port);
  const [descVal, setDescVal] = useState(port.description);
  const [domainVal, setDomainVal] = useState(port.domain);
  // Set when this row triggers a build; drives the run poll below.
  const [queueUrl, setQueueUrl] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: run } = useJenkinsRun(projectId, env.id, queueUrl);

  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed.');
  const save = (input: Parameters<typeof updatePort.mutate>[0]['input']) =>
    updatePort.mutate({ envId: env.id, portId: port.id, input }, { onError });

  // A run is "live" from the moment the trigger returns until the poll reports a
  // terminal phase — used to block a second trigger on the same row.
  const runActive = Boolean(queueUrl) && (!run || !isTerminalRunPhase(run.phase));

  // Status cell: the live run wins while one is in flight, since it knows about
  // *this* build; otherwise fall back to the job list's last-known state.
  const liveStatus = (() => {
    // Optimistic: the trigger succeeded but the first poll hasn't landed yet.
    if (queueUrl && !run) return <JenkinsRunBadge phase="QUEUED" result={null} />;
    if (!run) return null;
    // Jenkins no longer knows about the run (an expired queue item) — fall back to
    // the job list rather than showing a dead-end state.
    if (run.phase === 'UNKNOWN') return null;
    // Only RUNNING carries more than a pill: the build number and progress.
    if (run.phase === 'RUNNING') {
      return (
        <div className="space-y-0.5">
          <JenkinsRunBadge phase="RUNNING" result={null} />
          <span className="block text-xs text-muted-foreground">
            {run.buildUrl && run.buildNumber ? (
              <a href={run.buildUrl} target="_blank" rel="noreferrer" className="hover:underline">
                #{run.buildNumber}
              </a>
            ) : null}
            {run.progress !== null ? ` · ${run.progress}%` : null}
          </span>
        </div>
      );
    }
    return (
      <JenkinsRunBadge phase={run.phase} result={run.result} title={run.reason || undefined} />
    );
  })();

  const status =
    liveStatus ??
    (job ? (
      <JenkinsStatusBadge status={job.status} building={job.building} />
    ) : (
      <span className="text-muted-foreground">—</span>
    ));

  // Name cell: for a Jenkins record, the job name as a link to the job; for a
  // manual record, an editable label.
  const nameCell = port.jenkinsJobUrl ? (
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
      placeholder="Name"
      className="h-8"
    />
  ) : (
    <span className="text-muted-foreground">{port.description || '—'}</span>
  );

  // Domain cell: the host this record is served on. Editable for every record,
  // Jenkins-linked or not — Jenkins knows the job, not where it's published.
  const domainCell = canEdit ? (
    <Input
      value={domainVal}
      onChange={(e) => setDomainVal(e.target.value)}
      onBlur={() => domainVal !== port.domain && save({ domain: domainVal })}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="dev.example.com"
      className="h-8"
    />
  ) : (
    <span className="text-sm text-muted-foreground">{port.domain || '—'}</span>
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
      <TableCell>{nameCell}</TableCell>
      <TableCell>{domainCell}</TableCell>
      <TableCell>{status}</TableCell>
      <TableCell>
        <LastBuild job={job} />
      </TableCell>
      {showActions ? (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {port.jenkinsJobUrl && canBuild ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Run build"
                title={runActive ? 'A build is already in progress' : 'Run build'}
                onClick={() =>
                  trigger.mutate(port.jenkinsJobUrl, {
                    onSuccess: ({ message, queueUrl: url }) => {
                      toast.success(message);
                      // Start following this run. Jenkins occasionally accepts a
                      // build without a Location header; then there's nothing to
                      // follow and the row falls back to the job list's state.
                      if (url) setQueueUrl(url);
                    },
                    onError,
                  })
                }
                disabled={trigger.isPending || runActive}
              >
                <Play className="h-4 w-4" />
              </Button>
            ) : null}
            {/* This record's own build history — who ran it, and how each run
                ended. Alongside Run, because they're the same unit of work. */}
            {port.jenkinsJobUrl && canBuild ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Build history"
                  title="Build history"
                  onClick={() => setHistoryOpen(true)}
                >
                  <History className="h-4 w-4" />
                </Button>
                <JenkinsHistoryDialog
                  projectId={projectId}
                  envId={env.id}
                  portId={port.id}
                  title={port.description || 'record'}
                  open={historyOpen}
                  onOpenChange={setHistoryOpen}
                />
              </>
            ) : null}
            {canEdit ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete record"
                onClick={() => removePort.mutate({ envId: env.id, portId: port.id }, { onError })}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            ) : null}
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
  canBuild,
}: {
  projectId: string;
  env: Environment;
  canEdit: boolean;
  canBuild: boolean;
}) {
  const { removeEnvironment, addPort, syncFromJenkins } = useEnvironmentMutations(projectId);
  const [port, setPort] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('');
  const [jenkinsOpen, setJenkinsOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [dockerOpen, setDockerOpen] = useState(false);
  const isJenkins = env.cicdProvider === 'jenkins';

  // Live Jenkins status/last-build for records that link a job — one request per
  // card (not per row) covering every record, matched by URL.
  //
  // Kept on a slow refresh while the card has jenkins-linked records so a build
  // started by someone else, or straight from Jenkins, still shows up. It has to
  // be time-based: nothing tells us a foreign build began. Builds triggered from
  // *this* row are followed precisely by useJenkinsRun instead.
  const hasJenkinsRecords = env.ports.some((p) => p.jenkinsJobUrl);
  const { data: jenkinsJobs } = useJenkinsJobs(
    projectId,
    env.id,
    hasJenkinsRecords,
    hasJenkinsRecords
  );
  const jobByUrl = useMemo(() => {
    const map = new Map<string, JenkinsJobSummary>();
    for (const j of jenkinsJobs ?? []) map.set(j.url, j);
    return map;
  }, [jenkinsJobs]);

  // An editor always has row actions (delete); a viewer only gets the column when
  // there is actually something to run in it.
  const showActions = canEdit || (canBuild && hasJenkinsRecords);

  const handleSyncJenkins = () => {
    syncFromJenkins.mutate(env.id, {
      onSuccess: (r) => toast.success(r.message),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Jenkins sync failed.'),
    });
  };

  const handleAddPort = () => {
    if (!port.trim()) return;
    addPort.mutate(
      {
        envId: env.id,
        input: { port, protocol: 'HTTPS', description, domain, position: env.ports.length },
      },
      {
        onSuccess: () => {
          setPort('');
          setDescription('');
          setDomain('');
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
              {/* Not Jenkins-specific — any environment can have records imported
                  from a `docker ps` paste, so this sits outside the isJenkins block. */}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Import records from docker ps"
                title="Import from docker ps"
                onClick={() => setDockerOpen(true)}
              >
                <Container className="h-4 w-4" />
              </Button>
              <DockerImportDialog
                projectId={projectId}
                envId={env.id}
                envName={env.name}
                portCount={env.ports.length}
                open={dockerOpen}
                onOpenChange={setDockerOpen}
              />
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

      {/* Five columns don't fit on a narrow viewport, so the table scrolls inside
          its own card rather than making the page scroll sideways. */}
      <div className="overflow-x-auto px-4 py-3">
        <Table className="min-w-[48rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Port</TableHead>
              <TableHead className="w-[22%]">Name</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-40">Last build</TableHead>
              {/* Room for up to three actions: Run · History · Delete. */}
              {showActions ? <TableHead className="w-32" /> : null}
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
                canBuild={canBuild}
                showActions={showActions}
                job={p.jenkinsJobUrl ? jobByUrl.get(p.jenkinsJobUrl) : undefined}
              />
            ))}
            {env.ports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showActions ? 6 : 5} className="text-center text-sm text-muted-foreground">
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
                    placeholder="Name"
                    className="h-8"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPort()}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="dev.example.com"
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
