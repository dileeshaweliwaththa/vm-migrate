import { findAllEnvironments } from '@/repositories/environments/environmentRepository';
import { findRecentBuildRuns } from '@/repositories/environmentBuildRuns/environmentBuildRunRepository';
import { listProjects } from '@/services/projects/projectService';
import { getTrackerData } from '@/services/vms/vmService';
import { rowToEnvironment } from '@/services/projects/mappers';
import { rowToBuildRun } from '@/services/jenkins/mappers';
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
} from '@/types/common/project';
import { isTerminalRunPhase } from '@/types/common/jenkins';
import type { EnvironmentBuildRun } from '@/types/common/jenkins';
import type { CountBreakdown, DashboardSummary, ProgressMetric } from '@/types/common/dashboard';

// Service layer: the read-only dashboard summary. It owns no tables — it counts
// what the projects, environments and VM-tracker slices already store, and
// answers one question per tile: how much is there, how far along is the
// migration, and what has been deployed lately.
//
// Readable by every signed-in role. There is no role gate here on purpose: each
// underlying read already applies its own rule (archived projects come back from
// `listProjects` for admins only) and RLS scopes the rest, so a viewer gets a
// summary of exactly the rows they may already read.

// How many runs back the activity feed shows.
const RECENT_BUILD_FEED = 8;
// The window the build aggregate covers, and the cap on rows pulled for it. An
// internal tool won't approach the cap; it exists so the query can't degrade if
// something starts triggering builds in a loop.
const BUILD_WINDOW_DAYS = 7;
const BUILD_WINDOW_CAP = 200;

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

const migrationProgress = (
  stats: ReturnType<typeof computeStats>
): ProgressMetric[] => [
  { label: 'VMs migrated', done: stats.migrated, total: stats.vms },
  { label: 'DNS updated', done: stats.dns, total: stats.urls },
  { label: 'URLs tested', done: stats.tested, total: stats.urls },
];

const summariseBuilds = (
  runs: EnvironmentBuildRun[]
): DashboardSummary['builds'] => {
  // A run is "in flight" while its phase is non-terminal — that is the same rule
  // the run poller uses, so the dashboard and the build card never disagree.
  const inFlight = runs.filter((r) => !isTerminalRunPhase(r.phase)).length;
  const succeeded = runs.filter((r) => r.result === 'SUCCESS').length;
  // Anything that finished on a non-SUCCESS result counts as failed here.
  // Deliberately coarse: the dashboard's job is "is anything broken?", and the
  // per-environment history carries the exact UNSTABLE/ABORTED distinction.
  const failed = runs.filter(
    (r) => isTerminalRunPhase(r.phase) && r.result !== null && r.result !== 'SUCCESS'
  ).length;

  return {
    lastWeek: { total: runs.length, succeeded, failed, inFlight },
    recent: runs.slice(0, RECENT_BUILD_FEED),
  };
};

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const since = new Date(
    Date.now() - BUILD_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Independent reads — run them together rather than in sequence.
  const [projects, environmentRows, tracker, buildRows] = await Promise.all([
    // `true` asks for archived too; the service grants that to admins only, so
    // for anyone else the archived tally below is simply 0.
    listProjects(true),
    findAllEnvironments(),
    getTrackerData(),
    findRecentBuildRuns(BUILD_WINDOW_CAP, since),
  ]);

  const environments: Environment[] = environmentRows.map(rowToEnvironment);
  const ports = environments.flatMap((env) => env.ports);

  return {
    projects: {
      total: projects.filter((p) => !p.archived).length,
      archived: projects.filter((p) => p.archived).length,
      clients: Array.from(new Set(projects.flatMap((p) => p.tags))).sort(),
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
    migration: migrationProgress(computeStats(tracker.vms)),
    builds: summariseBuilds(buildRows.map(rowToBuildRun)),
  };
};
