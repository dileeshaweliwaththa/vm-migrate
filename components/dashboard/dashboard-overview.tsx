import Link from 'next/link';
import {
  Activity,
  FolderKanban,
  Layers,
  Server,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/vm-utils';
import { isTerminalRunPhase } from '@/types/common/jenkins';
import type { EnvironmentBuildRun, JenkinsBuildStatus } from '@/types/common/jenkins';
import type { CountBreakdown, DashboardSummary, ProgressMetric } from '@/types/common/dashboard';

// UI layer: the dashboard summary. Pure and presentational — every number
// arrives as a prop from the page, which reads them through dashboardService.

// ---- pieces ----------------------------------------------------------------

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
}) {
  const body = (
    <Card
      className={cn(
        'h-full rounded-lg border-border shadow-none transition-colors',
        href && 'hover:border-input hover:bg-muted/40'
      )}
    >
      <CardHeader className="gap-1">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="text-xs font-medium tracking-wide uppercase">
            {label}
          </CardDescription>
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        </div>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
        {/* Reserve the sub-line's height even when empty so tiles align. */}
        <p className="min-h-4 text-xs text-muted-foreground">{sub ?? ''}</p>
      </CardHeader>
    </Card>
  );

  return href ? (
    <Link href={href} className="block focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

function ProgressRow({ metric }: { metric: ProgressMetric }) {
  // 0/0 is "nothing to do", not 0% done — show a full, muted bar rather than an
  // empty one that reads as work outstanding.
  const empty = metric.total === 0;
  const percent = empty ? 100 : Math.round((metric.done / metric.total) * 100);

  return (
    <div className="space-y-1.5">
      {/* Two auto-width items on one baseline. On a phone neither could shrink,
          so the ratio broke across lines mid-expression ("12 / 340 ·" above
          "35%") and a wrapped label left the baseline alignment pointing at its
          first line. The ratio is the row's payload, so it never wraps and the
          label ellipsizes instead. */}
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">{metric.label}</span>
        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {empty ? '—' : `${metric.done} / ${metric.total} · ${percent}%`}
        </span>
      </div>
      <Progress
        value={percent}
        className={cn('h-2', empty && 'opacity-40')}
        aria-label={`${metric.label}: ${empty ? 'nothing tracked yet' : `${percent}%`}`}
      />
    </div>
  );
}

function BreakdownList({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: CountBreakdown[];
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{row.label}</span>
              <span className="font-semibold tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Build outcome → the shared tracker tone vocabulary, so a green pill means the
// same thing on this page as it does in the tracker.
const resultTone = (run: EnvironmentBuildRun): StatusTone => {
  if (!isTerminalRunPhase(run.phase)) return 'info';
  if (run.result === 'SUCCESS') return 'success';
  if (run.result === 'UNSTABLE') return 'warning';
  if (run.result === null) return 'warning';
  return 'danger';
};

const resultLabel = (run: EnvironmentBuildRun): string => {
  if (!isTerminalRunPhase(run.phase)) return run.phase;
  return (run.result as JenkinsBuildStatus | null) ?? 'UNKNOWN';
};

// "12 Aug, 15:04". `toLocaleString()`'s default runs to ~22 characters
// ("8/12/2026, 3:04:11 PM"), and on a phone it was the tail of the meta line —
// so the half that got truncated away was the half that says *when*. Seconds and
// the year carry nothing in a 7-day feed. The locale is pinned because this
// renders on the server, where an implicit one is the container's, not the
// reader's.
const BUILD_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

function BuildRow({ run }: { run: EnvironmentBuildRun }) {
  return (
    // Two stacked lines rather than one row of [text | pill]: the pill is
    // fixed-width and unshrinkable, so on a narrow screen it was taking its
    // ~5rem out of the only column that had anything to say.
    <li className="space-y-1 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">
          {run.jobName || 'Unnamed job'}
          {run.buildNumber !== null ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              #{run.buildNumber}
            </span>
          ) : null}
        </p>
        <span
          className={cn(
            'shrink-0 rounded-sm px-2.5 py-0.5 text-[11px] font-semibold',
            STATUS_TONE_CLASS[resultTone(run)]
          )}
        >
          {resultLabel(run)}
        </span>
      </div>
      {/* Who · when, across the full width. The time is fixed-length and the one
          part that has to survive, so the user label — an email of any length —
          is what gives way. */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{run.triggeredByLabel}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">
          {new Date(run.startedAt).toLocaleString('en-GB', BUILD_TIME_FORMAT)}
        </span>
      </p>
    </li>
  );
}

// ---- page body -------------------------------------------------------------

export function DashboardOverview({ summary }: { summary: DashboardSummary }) {
  const { projects, environments, records, migration, builds } = summary;

  const archivedNote =
    projects.archived > 0 ? `${projects.archived} archived` : undefined;
  const clientNote =
    projects.clients.length > 0
      ? `${projects.clients.length} client${projects.clients.length === 1 ? '' : 's'}`
      : undefined;

  return (
    // Same container as every other page body, so the tiles line up with the
    // page header above them (which is `px-4 sm:px-8`) and the dashboard stops
    // running full-bleed while its siblings are capped.
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-8">
      {/* Row 1 — the four headline counts. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={FolderKanban}
          label="Projects"
          value={projects.total}
          sub={[clientNote, archivedNote].filter(Boolean).join(' · ') || undefined}
          href="/projects"
        />
        <StatTile
          icon={Layers}
          label="Environments"
          value={environments.total}
          sub={
            environments.total > 0
              ? `${environments.withJenkins} on Jenkins · ${environments.linkedToVm} linked to a VM`
              : undefined
          }
          href="/projects"
        />
        <StatTile
          icon={Server}
          label="Deployed records"
          value={records.total}
          sub={records.total > 0 ? `${records.reachable} with a reachable URL` : undefined}
        />
        <StatTile
          icon={Activity}
          label="Builds this week"
          value={builds.lastWeek.total}
          sub={
            builds.lastWeek.total > 0
              ? `${builds.lastWeek.succeeded} passed · ${builds.lastWeek.failed} failed${
                  builds.lastWeek.inFlight > 0 ? ` · ${builds.lastWeek.inFlight} running` : ''
                }`
              : undefined
          }
        />
      </div>

      {/* Row 2 — progress on the left, activity on the right.

          Both cards carry `min-w-0`: a grid item's default `min-width: auto` is
          its content's min-content width, so one long job name or ratio would
          widen the track and give the whole page a horizontal scrollbar on a
          phone rather than being ellipsized inside the card. */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 rounded-lg border-border shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Migration progress</CardTitle>
            <CardDescription>
              How far the VM migration has come, from the tracker.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {migration.map((metric) => (
              <ProgressRow key={metric.label} metric={metric} />
            ))}
            <Separator className="h-px w-full" />
            <Link
              href="/tracker"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open the VM tracker →
            </Link>
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-lg border-border shadow-none lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Recent builds</CardTitle>
            <CardDescription>
              The latest deploys anyone on the team triggered.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {builds.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No builds triggered in the last 7 days.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {builds.recent.map((run) => (
                  <BuildRow key={run.id} run={run} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — the smaller breakdowns. */}
      <Card className="rounded-lg border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Breakdown</CardTitle>
          <CardDescription>Where the environments and records sit.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-3">
          <BreakdownList
            title="Environments by stage"
            rows={environments.byStage}
            emptyText="No environments yet."
          />
          <BreakdownList
            title="CI/CD provider"
            rows={environments.byProvider}
            emptyText="No providers configured."
          />
          <BreakdownList
            title="Records by source"
            rows={records.bySource}
            emptyText="No records yet."
          />
        </CardContent>
      </Card>

      {projects.clients.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Clients
          </span>
          {projects.clients.map((client) => (
            <Badge key={client} variant="secondary" className="font-normal">
              {client}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
