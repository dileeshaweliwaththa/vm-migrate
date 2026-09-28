'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import {
  Activity,
  ArrowLeft,
  Check,
  DatabaseBackup,
  ExternalLink,
  Info,
  Layers,
  Minus,
  RefreshCw,
  Settings2,
  Table2,
} from 'lucide-react';
import { useVmDetail, useVmHealth } from '@/hooks/vms/useVmDetail';
import { useTestVmJenkins } from '@/hooks/vms/useVmJenkins';
import { bareHost, domainUrl, environmentTitle, recordLiveUrl, vmLiveIp } from '@/lib/endpoints';
import { cn } from '@/lib/utils';
import type {
  EndpointHealth,
  HealthState,
  HealthTargetKind,
  Vm,
  VmDetail,
  VmHealthReport,
  VmUrl,
} from '@/types/common/vm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PageHeader } from '@/components/layout/page-header';

// The VM page (docs/vms.md): one machine and everything tied to it, plus a live
// check of whether its endpoints answer. Read-only — editing stays in the VM
// Tracker, which owns the edit/trash/restore rules; the page links there.

// The pill colours come from the `tone-*` tokens, like the Jenkins status pills,
// so no call site names a colour and every state still carries its name as text.
const HEALTH_CLASS: Record<HealthState, string> = {
  up: 'bg-tone-success text-tone-success-fg',
  down: 'bg-tone-danger text-tone-danger-fg',
  skipped: 'bg-muted text-muted-foreground',
};

export function VmDetailView({ id, canEdit }: { id: string; canEdit: boolean }) {
  const { data, isLoading, error } = useVmDetail(id);
  const health = useVmHealth(id, Boolean(data));

  if (isLoading) {
    return (
      <>
        <PageHeader title="VM" />
        <div className="w-full space-y-4 px-4 py-8 sm:px-8">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </>
    );
  }

  if (error || !data) {
    const notFound = (error as { status?: number } | null)?.status === 404;
    return (
      <>
        <PageHeader title={notFound ? 'VM not found' : 'VM'} />
        <div className="w-full space-y-4 px-4 py-8 sm:px-8">
          <p className={cn('text-body-sm', notFound ? 'text-muted-foreground' : 'text-destructive')}>
            {notFound
              ? 'This VM doesn’t exist, or it’s in the tracker’s trash.'
              : error instanceof Error
                ? error.message
                : 'Failed to load the VM.'}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/vms">
              <ArrowLeft className="mr-2 h-4 w-4" /> All VMs
            </Link>
          </Button>
        </div>
      </>
    );
  }

  const { vm } = data;
  const liveIp = vmLiveIp(vm);

  return (
    <>
      <PageHeader
        title={vm.name || 'Unnamed VM'}
        stats={
          <>
            <span className="font-mono">{liveIp || 'No address yet'}</span>
            <span>{vm.isClient ? 'Client' : 'UPVIEW'}</span>
            <span>{vm.migrated ? 'Migrated' : 'Not migrated'}</span>
            {data.group ? <span>Group: {data.group.name}</span> : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => health.refetch()}
              disabled={health.isFetching}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', health.isFetching && 'animate-spin')} />
              {health.isFetching ? 'Checking…' : 'Check now'}
            </Button>
            <Button size="sm" asChild>
              <Link href="/tracker">
                <Table2 className="mr-2 h-4 w-4" /> Open in VM Tracker
              </Link>
            </Button>
          </div>
        }
      />

      {/* Full width, no centred column: this page is a dashboard of one
          machine, and the endpoints table is the widest thing on it. The
          sections re-flow into columns as the screen allows — four across on
          a wide monitor, stacked on a narrow one. */}
      <div className="w-full space-y-6 px-4 py-8 sm:px-8">
        <HealthSummary
          report={health.data}
          error={health.error}
          checking={health.isFetching}
          endpointCount={vm.urls.length}
        />

        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
          <OverviewCard detail={data} />
          <AddressesCard vm={vm} />
          <EnvironmentsCard detail={data} />
          <JenkinsCard vm={vm} canEdit={canEdit} />
        </div>

        <EndpointsCard vm={vm} report={health.data} />

        <BackupsCard detail={data} />
      </div>
    </>
  );
}

// ---- health ----------------------------------------------------------------

// The table's per-cell status: the state and nothing else, one fixed-size pill,
// so a long reason or a slow timing can never push into the next column. The
// numbers and the reason are in the row's info popover (EndpointInfo).
function HealthPill({ result }: { result: EndpointHealth }) {
  return (
    <span
      title={result.message || undefined}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-sm px-2 py-0.5 text-label-caps font-bold uppercase',
        HEALTH_CLASS[result.state]
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      {result.state}
    </span>
  );
}

// "HTTP 404 · 515 ms" — or just the timing for TCP, or nothing for a skip.
const healthFigures = (result: EndpointHealth): string =>
  [result.status ? `HTTP ${result.status}` : '', result.ms !== null ? `${result.ms} ms` : '']
    .filter(Boolean)
    .join(' · ');

function HealthSummary({
  report,
  error,
  checking,
  endpointCount,
}: {
  report?: VmHealthReport;
  error: Error | null;
  checking: boolean;
  endpointCount: number;
}) {
  const count = (state: HealthState) => report?.results.filter((r) => r.state === state).length ?? 0;
  return (
    <Card className="rounded-lg shadow-none">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-body-md font-medium">Endpoint health</p>
            <p className="text-xs text-muted-foreground">
              {endpointCount === 0
                ? 'No endpoints on this machine to check.'
                : checking && !report
                  ? 'Probing every endpoint from the server…'
                  : error
                    ? error.message
                    : report
                      ? `Checked ${new Date(report.checkedAt).toLocaleTimeString()}${
                          report.truncated ? ` · ${report.truncated} more not checked (limit per check)` : ''
                        }`
                      : ''}
            </p>
          </div>
        </div>
        {report ? (
          <div className="flex flex-wrap gap-2 text-body-sm">
            <span className={cn('rounded-sm px-2 py-0.5 font-medium', HEALTH_CLASS.up)}>{count('up')} up</span>
            <span className={cn('rounded-sm px-2 py-0.5 font-medium', HEALTH_CLASS.down)}>{count('down')} down</span>
            <span className={cn('rounded-sm px-2 py-0.5 font-medium', HEALTH_CLASS.skipped)}>
              {count('skipped')} skipped
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---- sections --------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-label-caps font-bold uppercase text-muted-foreground">{label}</dt>
      <dd className="text-body-sm">{children}</dd>
    </div>
  );
}

const Tick = ({ on }: { on: boolean }) =>
  on ? (
    <Check className="h-4 w-4 text-tone-success-fg" aria-label="Yes" />
  ) : (
    <Minus className="h-4 w-4 text-muted-foreground" aria-label="No" />
  );

function OverviewCard({ detail }: { detail: VmDetail }) {
  const { vm } = detail;
  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader>
        <CardTitle className="text-body-md font-semibold">Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4">
          <Field label="Old IP">
            <span className="font-mono text-label-mono">{vm.oldIp || '—'}</span>
          </Field>
          <Field label="New IP">
            <span className="font-mono text-label-mono">{vm.newIp || '—'}</span>
          </Field>
          <Field label="Migration">{vm.migrated ? 'Migrated' : 'Not migrated'}</Field>
          <Field label="Owner">{vm.isClient ? 'Client' : 'UPVIEW'}</Field>
          <Field label="Group">{detail.group?.name ?? '—'}</Field>
          <Field label="Supabase host">
            <Tick on={vm.isSupabase} />
          </Field>
          <Field label="Keep">
            <Tick on={vm.keep} />
          </Field>
          <div className="col-span-2">
            <Field label="Notes">
              <span className="whitespace-pre-wrap text-muted-foreground">{vm.notes || '—'}</span>
            </Field>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function AddressesCard({ vm }: { vm: Vm }) {
  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader>
        <CardTitle className="text-body-md font-semibold">Addresses</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-label-mono">{vm.newIp || vm.oldIp || '—'}</span>
          <Badge variant="secondary" className="rounded-sm text-label-caps uppercase">
            Primary
          </Badge>
        </div>
        {vm.ips.map((ip) => (
          <div key={ip.id} className="space-y-0.5 border-t border-border pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-label-mono">{ip.address}</span>
              <Badge variant="outline" className="rounded-sm text-label-caps uppercase">
                {ip.origin}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {[ip.label, ip.sourceVmName ? `from ${ip.sourceVmName}` : '', ip.movedAt ? `moved ${ip.movedAt}` : '']
                .filter(Boolean)
                .join(' · ') || 'No details recorded'}
            </p>
          </div>
        ))}
        {vm.ips.length === 0 ? (
          <p className="text-xs text-muted-foreground">No additional addresses.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// The address a row's direct link uses — the adopted one it names, else the
// machine's own. Same rule as the health check and the projects' Link column.
const addressFor = (vm: Vm, url: VmUrl): string =>
  (url.ipId && vm.ips.find((ip) => ip.id === url.ipId)?.address) || vmLiveIp(vm);

function LinkOut({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Open ${href}`}
      className="inline-flex items-center gap-1 break-all font-mono text-label-mono text-ink-accent hover:underline"
    >
      {label}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

// Everything about one endpoint that doesn't fit in its row: each probe's
// figures and reason, which address it answers on, and its notes. Behind an (i)
// so the table stays one line per endpoint.
function EndpointInfo({
  vm,
  url,
  results,
}: {
  vm: Vm;
  url: VmUrl;
  results: EndpointHealth[];
}) {
  const adopted = url.ipId ? vm.ips.find((ip) => ip.id === url.ipId) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Endpoint details" title="Details">
          <Info className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-4 text-body-sm">
        <div>
          <p className="font-medium">Health</p>
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground">Not checked yet.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {results.map((r) => (
                <li key={r.kind} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label-caps font-bold uppercase text-muted-foreground">
                      {r.kind === 'direct' ? 'Direct' : 'Domain'}
                    </span>
                    <HealthPill result={r} />
                  </div>
                  <p className="break-all font-mono text-label-mono">{r.target}</p>
                  {healthFigures(r) ? (
                    <p className="font-mono text-label-mono text-muted-foreground">{healthFigures(r)}</p>
                  ) : null}
                  {r.message ? <p className="text-xs text-muted-foreground">{r.message}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <Field label="Answers on">
            <span className="font-mono text-label-mono">
              {adopted ? adopted.address : vmLiveIp(vm) || '—'}
            </span>
            <span className="block text-xs text-muted-foreground">
              {adopted ? adopted.label || 'extra address' : 'primary address'}
            </span>
          </Field>
          <Field label="Port · protocol">
            <span className="font-mono text-label-mono">
              {url.port || '—'} · {url.proto}
            </span>
          </Field>
          <Field label="DNS updated">
            <Tick on={url.dns} />
          </Field>
          <Field label="Tested">
            <Tick on={url.tested} />
          </Field>
          <div className="col-span-2">
            <Field label="Notes">
              <span className="whitespace-pre-wrap text-muted-foreground">{url.notes || '—'}</span>
            </Field>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

// A link with its health pill beside it, on one line. The link truncates rather
// than wrapping into the next column; the full address is its tooltip.
function TargetCell({
  href,
  label,
  result,
}: {
  href: string | null;
  label: string;
  result?: EndpointHealth;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={`Open ${href}`}
          className="inline-flex min-w-0 items-center gap-1 font-mono text-label-mono text-ink-accent hover:underline"
        >
          <span className="truncate">{label}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="truncate font-mono text-label-mono text-muted-foreground">{label}</span>
      )}
      {result ? <HealthPill result={result} /> : null}
    </div>
  );
}

function EndpointsCard({ vm, report }: { vm: Vm; report?: VmHealthReport }) {
  const resultsFor = (urlId: string) => report?.results.filter((r) => r.urlId === urlId) ?? [];
  const resultFor = (urlId: string, kind: HealthTargetKind) =>
    resultsFor(urlId).find((r) => r.kind === kind);

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader>
        <CardTitle className="text-body-md font-semibold">
          Endpoints <span className="font-normal text-muted-foreground">· {vm.urls.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {vm.urls.length === 0 ? (
          <p className="px-6 pb-6 text-body-sm text-muted-foreground">
            No endpoints yet — add them in the VM Tracker or on a project environment.
          </p>
        ) : (
          <div className="overflow-x-auto [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_td]:py-3 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6 [&_th]:text-label-caps [&_th]:font-bold [&_th]:text-muted-foreground [&_th]:uppercase">
            {/* `table-fixed` so the widths below are what the columns get — with
                `auto`, one long domain squeezes its neighbours, which is how the
                pills ended up overlapping the next column. */}
            <Table className="min-w-[64rem] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[26%]">Direct</TableHead>
                  <TableHead className="w-[30%]">Domain</TableHead>
                  <TableHead className="w-20">Proto</TableHead>
                  <TableHead>Belongs to</TableHead>
                  <TableHead className="w-14 text-center">DNS</TableHead>
                  <TableHead className="w-16 text-center">Tested</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vm.urls.map((url) => {
                  const address = addressFor(vm, url);
                  const direct = recordLiveUrl({ port: url.port, protocol: url.proto }, address || null);
                  const domain = domainUrl(url.url);
                  return (
                    <TableRow key={url.id}>
                      <TableCell>
                        <TargetCell
                          href={direct}
                          label={direct ? direct.replace(/^\w+:\/\//, '') : `${address || '—'}:${url.port || '—'}`}
                          result={resultFor(url.id, 'direct')}
                        />
                      </TableCell>
                      <TableCell>
                        {domain ? (
                          <TargetCell href={domain} label={bareHost(url.url)} result={resultFor(url.id, 'domain')} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-label-mono">{url.proto}</TableCell>
                      <TableCell className="truncate">
                        {url.projectId ? (
                          <Link
                            href={`/projects/${url.projectId}`}
                            className="text-body-sm text-ink-accent hover:underline"
                          >
                            {url.projectName}
                            <span className="text-muted-foreground">
                              {' '}
                              · {environmentTitle(url.environmentName, url.environmentLabel)}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-body-sm text-muted-foreground">This VM (tracker)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="flex justify-center">
                          <Tick on={url.dns} />
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex justify-center">
                          <Tick on={url.tested} />
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <EndpointInfo vm={vm} url={url} results={resultsFor(url.id)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EnvironmentsCard({ detail }: { detail: VmDetail }) {
  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body-md font-semibold">
          <Layers className="h-4 w-4 text-muted-foreground" /> Projects & environments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {detail.environments.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">No project environment is deployed here.</p>
        ) : (
          detail.environments.map((env) => (
            <Link
              key={env.id}
              href={`/projects/${env.projectId}`}
              className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-medium">
                  {env.projectName || 'Project'}
                  {env.projectArchived ? <span className="font-normal text-muted-foreground"> (archived)</span> : null}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {environmentTitle(env.name, env.label)} · {env.cicdProvider.toUpperCase()}
                </span>
              </span>
              <span className="shrink-0 font-mono text-label-mono text-muted-foreground">
                {env.recordCount} rec
              </span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function JenkinsCard({ vm, canEdit }: { vm: Vm; canEdit: boolean }) {
  const test = useTestVmJenkins();
  const run = () =>
    test.mutate(
      { vmId: vm.id },
      {
        onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Jenkins test failed.'),
      }
    );

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body-md font-semibold">
          <Settings2 className="h-4 w-4 text-muted-foreground" /> Jenkins
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {vm.jenkins ? (
          <>
            <dl className="space-y-3">
              <Field label="Server">
                <LinkOut href={vm.jenkins.baseUrl} label={bareHost(vm.jenkins.baseUrl)} />
              </Field>
              <Field label="User">{vm.jenkins.username || '—'}</Field>
              <Field label="API token">{vm.jenkins.hasToken ? 'Stored' : 'Not set'}</Field>
            </dl>
            {/* Testing reaches the server with the stored token, which is an
                editor action in vmJenkinsService — so is the button. */}
            {canEdit ? (
              <Button variant="outline" size="sm" onClick={run} disabled={test.isPending}>
                <Activity className="mr-2 h-4 w-4" />
                {test.isPending ? 'Testing…' : 'Test connection'}
              </Button>
            ) : null}
            {test.data ? (
              <p className={cn('text-xs', test.data.ok ? 'text-muted-foreground' : 'text-destructive')}>
                {test.data.message}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            No Jenkins server on this machine. Set one up from the VM Tracker.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BackupsCard({ detail }: { detail: VmDetail }) {
  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body-md font-semibold">
          <DatabaseBackup className="h-4 w-4 text-muted-foreground" /> Backups
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {detail.backupTargets.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            No backup target’s database host is one of this machine’s addresses.
          </p>
        ) : (
          detail.backupTargets.map((t) => (
            <Link
              key={t.id}
              href={`/backups/${t.id}`}
              className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-medium">{t.name || t.dbHost}</span>
                <span className="block font-mono text-label-mono text-muted-foreground">
                  {t.dbHost}:{t.dbPort}
                </span>
              </span>
              <Badge variant="outline" className="shrink-0 rounded-sm text-label-caps uppercase">
                {t.engine}
              </Badge>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
