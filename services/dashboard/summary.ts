import { recordUrl } from '@/lib/endpoints';
import { computeStats } from '@/lib/vm-utils';
import {
  CICD_PROVIDERS,
  ENVIRONMENT_NAMES,
  PORT_SOURCES,
  type CicdProvider,
  type Environment,
  type EnvironmentName,
  type PortSource,
  type Project,
} from '@/types/common/project';
import { isTerminalRunPhase, type EnvironmentBuildRun } from '@/types/common/jenkins';
import type { Vm } from '@/types/common/vm';
import {
  DASHBOARD_BUILD_WINDOWS,
  DEFAULT_DASHBOARD_BUILD_WINDOW,
  type CountBreakdown,
  type DashboardBuildWindow,
  type DashboardFilters,
  type DashboardSummary,
  type ProgressMetric,
} from '@/types/common/dashboard';

// The dashboard's arithmetic, with no I/O: `dashboardService` reads, this counts.
// Kept pure so the filtering (#75) is unit-tested rather than trusted.

// How many runs back the activity feed shows.
const RECENT_BUILD_FEED = 8;

// Counts values into the canonical order of their enum, dropping empties when
// asked. Fixed order matters: "DEV, STAGE, PRODUCTION" reads as a pipeline,
// whereas whatever order the rows arrive in reads as noise.
const tally = <T extends string>(
  order: readonly T[],
  values: T[],
  label: (key: T) => string,
  keepZero: boolean
): CountBreakdown<T>[] => {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return order
    .map((key) => ({ key, label: label(key), count: counts.get(key) ?? 0 }))
    .filter((row) => keepZero || row.count > 0);
};

const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

// Provider names are acronyms as often as words, so they aren't title-cased
// blindly.
const PROVIDER_LABELS: Record<CicdProvider, string> = {
  jenkins: 'Jenkins',
  aws: 'AWS',
  azure: 'Azure',
  amplify: 'Amplify',
  other: 'Other',
  none: 'None',
};

const migrationProgress = (stats: ReturnType<typeof computeStats>): ProgressMetric[] => [
  { label: 'VMs migrated', done: stats.migrated, total: stats.vms },
  { label: 'DNS updated', done: stats.dns, total: stats.urls },
  { label: 'URLs tested', done: stats.tested, total: stats.urls },
];

// Reads the filters from a query string, falling back rather than failing: an
// unknown window is the default one, a blank client is every client. Whether the
// client exists is checked against the data in `buildDashboardSummary`.
export const parseDashboardFilters = (params: {
  client?: string | null;
  days?: string | null;
}): DashboardFilters => {
  const days = Number(params.days);
  return {
    client: params.client?.trim() || null,
    days: DASHBOARD_BUILD_WINDOWS.includes(days as DashboardBuildWindow)
      ? (days as DashboardBuildWindow)
      : DEFAULT_DASHBOARD_BUILD_WINDOW,
  };
};

export interface DashboardInputs {
  // Already role-scoped by the reads: archived ones only for admins.
  projects: Project[];
  environments: Environment[];
  vms: Vm[];
  // The runs inside the window, newest first.
  runs: EnvironmentBuildRun[];
  // The window held more runs than were fetched.
  runsCapped: boolean;
}

export const buildDashboardSummary = (
  inputs: DashboardInputs,
  requested: DashboardFilters
): DashboardSummary => {
  const clients = Array.from(new Set(inputs.projects.flatMap((p) => p.tags))).sort();
  // A client nobody is tagged with falls back to every client, and `filters`
  // says so, rather than an empty dashboard that looks like a fact.
  const client = requested.client && clients.includes(requested.client) ? requested.client : null;
  const filters: DashboardFilters = { client, days: requested.days };

  const projects = client ? inputs.projects.filter((p) => p.tags.includes(client)) : inputs.projects;
  const projectIds = new Set(projects.map((p) => p.id));
  const environments = client
    ? inputs.environments.filter((e) => projectIds.has(e.projectId))
    : inputs.environments;
  const environmentIds = new Set(environments.map((e) => e.id));
  const ports = environments.flatMap((env) => env.ports);

  // A client's migration is the VMs its environments are deployed on.
  const vmIds = new Set(environments.map((e) => e.vmId).filter((id): id is string => Boolean(id)));
  const vms = client ? inputs.vms.filter((vm) => vmIds.has(vm.id)) : inputs.vms;

  const runs = client ? inputs.runs.filter((r) => environmentIds.has(r.environmentId)) : inputs.runs;

  return {
    filters,
    projects: {
      total: projects.filter((p) => !p.archived).length,
      archived: projects.filter((p) => p.archived).length,
      clients,
    },
    environments: {
      total: environments.length,
      // Every stage stays visible even at zero — an empty PRODUCTION column is
      // itself the interesting fact.
      byStage: tally(
        ENVIRONMENT_NAMES,
        environments.map((e) => e.name),
        (key: EnvironmentName) => titleCase(key.toLowerCase()),
        true
      ),
      byProvider: tally(
        CICD_PROVIDERS,
        environments.map((e) => e.cicdProvider),
        (key) => PROVIDER_LABELS[key],
        false
      ),
      withJenkins: environments.filter((e) => e.jenkinsUrl.trim().length > 0).length,
      linkedToVm: environments.filter((e) => e.vmId !== null).length,
    },
    records: {
      total: ports.length,
      bySource: tally(
        PORT_SOURCES,
        ports.map((p) => p.source),
        (key: PortSource) => titleCase(key),
        false
      ),
      reachable: ports.filter((p) => recordUrl(p) !== null).length,
    },
    migration: migrationProgress(computeStats(vms)),
    builds: {
      inWindow: {
        days: filters.days,
        total: runs.length,
        // A run is "in flight" while its phase is non-terminal — the same rule
        // the run poller uses, so the dashboard and the build card never disagree.
        inFlight: runs.filter((r) => !isTerminalRunPhase(r.phase)).length,
        succeeded: runs.filter((r) => r.result === 'SUCCESS').length,
        // Anything that finished on a non-SUCCESS result counts as failed here.
        // Deliberately coarse: the dashboard's job is "is anything broken?", and
        // the per-environment history carries the exact UNSTABLE/ABORTED split.
        failed: runs.filter(
          (r) => isTerminalRunPhase(r.phase) && r.result !== null && r.result !== 'SUCCESS'
        ).length,
        capped: inputs.runsCapped,
      },
      recent: runs.slice(0, RECENT_BUILD_FEED),
    },
  };
};
