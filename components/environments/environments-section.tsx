'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Container,
  Copy,
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
import { providerHasBranch, providerHasPorts } from '@/types/common/project';
import type { Protocol } from '@/types/common/vm';
import { recordLiveUrl } from '@/lib/endpoints';

// What a hand-added record is created as. Shared by the Add row's handler and its
// live-link preview so the preview can't promise a URL the record won't get.
const NEW_RECORD_PROTOCOL: Protocol = 'HTTPS';

// The scheme on a link is always implied (see recordLiveUrl), so what's shown is
// the `ip:port` people actually recognise.
const hostAndPort = (url: string): string => url.replace(/^\w+:\/\//, '');
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

// The record's direct address on the environment's VM — `ip:port`, opened and
// copied straight from the row. It only appears once both halves exist, so the
// cell's job when one is missing is to say *which* one, rather than showing a
// bare dash the reader has to diagnose. The prompt to fill the gap is editors-only:
// a viewer can't act on it, and the port cell beside it isn't an input for them.
function LiveUrlCell({
  port,
  vmIp,
  canEdit,
}: {
  port: EnvironmentPort;
  vmIp: string | null;
  canEdit: boolean;
}) {
  const url = recordLiveUrl(port, vmIp);

  if (!url) {
    const missingPort = !port.port.trim();
    return (
      <span
        className="text-sm text-muted-foreground"
        title={missingPort ? 'Add a port to build the link' : 'This record is not a web endpoint'}
      >
        {missingPort && canEdit ? 'Add a port' : '—'}
      </span>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy — open the link and copy it from the address bar.');
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={`Open ${url}`}
        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
      >
        {hostAndPort(url)}
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy link"
        title="Copy link"
        onClick={copy}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// A single record row: Port · Name · Link · Domain · Status · Last build (+ Run/Delete).
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
  showBuildColumns,
  showPort,
  showBranch,
  showLiveUrl,
  job,
}: {
  projectId: string;
  env: Environment;
  port: EnvironmentPort;
  canEdit: boolean;
  canBuild: boolean;
  showActions: boolean;
  // Which columns this provider warrants; see the card for why. Jenkins-only for
  // the build pair, port-bearing providers only for Port, a linked VM with an
  // address for Link.
  showBuildColumns: boolean;
  showPort: boolean;
  showBranch: boolean;
  showLiveUrl: boolean;
  job?: JenkinsJobSummary;
}) {
  const { updatePort, removePort } = useEnvironmentMutations(projectId);
  const trigger = useTriggerJenkinsBuild(projectId, env.id);
  const [portVal, setPortVal] = useState(port.port);
  const [branchVal, setBranchVal] = useState(port.branch);
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
      {showPort ? (
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
      ) : null}
      {/* Takes Port's place on a managed platform: what identifies the record
          there is the branch that gets deployed. */}
      {showBranch ? (
        <TableCell>
          {canEdit ? (
            <Input
              value={branchVal}
              onChange={(e) => setBranchVal(e.target.value)}
              onBlur={() => branchVal !== port.branch && save({ branch: branchVal })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder="main"
              className="h-8 font-mono"
            />
          ) : (
            <span className="font-mono">{port.branch || '—'}</span>
          )}
        </TableCell>
      ) : null}
      <TableCell>{nameCell}</TableCell>
      {/* Ahead of Domain: it's the address that works first — the port is live on
          the VM the moment the record exists, while the domain still has to be
          pointed at it. */}
      {showLiveUrl ? (
        <TableCell>
          <LiveUrlCell port={port} vmIp={env.vmIp} canEdit={canEdit} />
        </TableCell>
      ) : null}
      <TableCell>{domainCell}</TableCell>
      {showBuildColumns ? (
        <>
          <TableCell>{status}</TableCell>
          <TableCell>
            <LastBuild job={job} />
          </TableCell>
        </>
      ) : null}
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
  const [branch, setBranch] = useState('');
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
  //
  // Only for Jenkins environments: a record that kept a job URL after the provider
  // was switched away shouldn't keep polling a server this card no longer uses.
  const hasJenkinsRecords = isJenkins && env.ports.some((p) => p.jenkinsJobUrl);
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

  // Which columns this provider actually warrants:
  //
  // - Status / Last build are Jenkins concepts, read from a job's colour and its
  //   last build. Nothing else has a job to read them from.
  // - Port where the provider deploys onto a host port, Branch where it deploys a
  //   *branch* instead (Amplify/AWS/Azure). Exactly one of the two, never both —
  //   see providerHasPorts / providerHasBranch.
  //
  // All three are column-count inputs, so they're computed once here and passed
  // down rather than re-derived per row, where header and body could drift apart.
  const showBuildColumns = isJenkins;
  const showPort = providerHasPorts(env.cicdProvider);
  const showBranch = providerHasBranch(env.cicdProvider);

  // Link needs both halves of `ip:port` to be *possible*: an address on the linked
  // VM, and a provider that deploys onto a host port at all. Without a VM the
  // column could only ever be a wall of dashes, so the card drops it — the missing
  // half is the environment's, and it's the VM chip in the header that says so.
  const showLiveUrl = showPort && Boolean(env.vmIp);

  // Name · Domain are always there; Port/Branch is one leading column either way.
  const leadingColumns = (showPort ? 1 : 0) + (showBranch ? 1 : 0) + (showLiveUrl ? 1 : 0) + 2;
  const columnCount = leadingColumns + (showBuildColumns ? 2 : 0) + (showActions ? 1 : 0);

  // Tailwind only sees literal class names, so the floor is picked rather than
  // computed. Link adds roughly another 12rem of content to whichever shape the
  // provider already had.
  const tableMinWidth = showBuildColumns
    ? showLiveUrl
      ? 'min-w-[60rem]'
      : 'min-w-[48rem]'
    : showLiveUrl
      ? 'min-w-[44rem]'
      : 'min-w-[32rem]';

  const handleSyncJenkins = () => {
    syncFromJenkins.mutate(env.id, {
      onSuccess: (r) => toast.success(r.message),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Jenkins sync failed.'),
    });
  };

  // A new record needs its identifying field filled in — the same leading column
  // the table shows: a port where there are ports, a branch where there aren't.
  const canAddRecord = showPort ? Boolean(port.trim()) : Boolean(branch.trim());

  // What the Link column will hold once this row is added, previewed as the port
  // is typed. Built through the same helper as the saved rows, so the preview and
  // the result can't disagree.
  const newRecordUrl = recordLiveUrl(
    { port, protocol: NEW_RECORD_PROTOCOL },
    showLiveUrl ? env.vmIp : null
  );

  const handleAddPort = () => {
    if (!canAddRecord) return;
    addPort.mutate(
      {
        envId: env.id,
        input: {
          port: showPort ? port : '',
          branch: showBranch ? branch : '',
          protocol: NEW_RECORD_PROTOCOL,
          description,
          domain,
          position: env.ports.length,
        },
      },
      {
        onSuccess: () => {
          setPort('');
          setBranch('');
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
              {/* Where the Link column's addresses come from — shown here once
                  rather than repeated down the column. */}
              {env.vmIp ? <span className="font-mono">· {env.vmIp}</span> : null}
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
              {/* Not Jenkins-specific — any *port-bearing* environment can have
                  records imported from a `docker ps` paste, so this sits outside
                  the isJenkins block. It is hidden for the managed providers:
                  `docker ps` is nothing but host ports, which those records don't
                  have a column for. */}
              {showPort ? (
                <>
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

      {/* A full Jenkins card doesn't fit on a narrow viewport, so the table scrolls
          inside its own card rather than making the page scroll sideways. Without
          the build columns it's four columns wide and needs far less room — the
          same floor would force a pointless sideways scroll. */}
      <div className="overflow-x-auto px-4 py-3">
        <Table className={tableMinWidth}>
          <TableHeader>
            <TableRow>
              {showPort ? <TableHead className="w-24">Port</TableHead> : null}
              {showBranch ? <TableHead className="w-40">Branch</TableHead> : null}
              <TableHead className="w-[22%]">Name</TableHead>
              {showLiveUrl ? (
                <TableHead className="w-48" title={`Direct address on ${env.vmName || 'the VM'}`}>
                  Link
                </TableHead>
              ) : null}
              <TableHead>Domain</TableHead>
              {showBuildColumns ? (
                <>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-40">Last build</TableHead>
                </>
              ) : null}
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
                showBuildColumns={showBuildColumns}
                showPort={showPort}
                showBranch={showBranch}
                showLiveUrl={showLiveUrl}
                job={p.jenkinsJobUrl ? jobByUrl.get(p.jenkinsJobUrl) : undefined}
              />
            ))}
            {env.ports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-sm text-muted-foreground">
                  No records yet.
                </TableCell>
              </TableRow>
            ) : null}
            {canEdit ? (
              <TableRow>
                {showPort ? (
                  <TableCell>
                    <Input
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="3000"
                      className="h-8 w-20 font-mono"
                    />
                  </TableCell>
                ) : null}
                {showBranch ? (
                  <TableCell>
                    <Input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="main"
                      className="h-8 font-mono"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddPort()}
                    />
                  </TableCell>
                ) : null}
                <TableCell>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Name"
                    className="h-8"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPort()}
                  />
                </TableCell>
                {/* Not an input — the link is derived. Previewing it as the port
                    is typed shows what the row will get, so the column doesn't
                    look broken while it's empty. */}
                {showLiveUrl ? (
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">
                      {newRecordUrl ? hostAndPort(newRecordUrl) : '—'}
                    </span>
                  </TableCell>
                ) : null}
                <TableCell>
                  <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="dev.example.com"
                    className="h-8"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPort()}
                  />
                </TableCell>
                {/* Everything after the input cells. Never zero: this row is
                    editors-only, and an editor always has the actions column. */}
                <TableCell colSpan={columnCount - leadingColumns}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddPort}
                    disabled={!canAddRecord}
                  >
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
