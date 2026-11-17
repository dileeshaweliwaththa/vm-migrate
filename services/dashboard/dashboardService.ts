import { findAllEnvironments } from '@/repositories/environments/environmentRepository';
import { findRecentBuildRuns } from '@/repositories/environmentBuildRuns/environmentBuildRunRepository';
import { listProjects } from '@/services/projects/projectService';
import { getTrackerData } from '@/services/vms/vmService';
import { rowToEnvironment } from '@/services/projects/mappers';
import { rowToBuildRun } from '@/services/jenkins/mappers';
import { buildDashboardSummary } from '@/services/dashboard/summary';
import type { DashboardFilters, DashboardSummary } from '@/types/common/dashboard';

// Service layer: the read-only dashboard summary. It owns no tables — it counts
// what the projects, environments and VM-tracker slices already store, and
// answers one question per tile: how much is there, how far along is the
// migration, and what has been deployed lately. This file reads; the counting is
// `buildDashboardSummary` in `summary.ts`, which is pure and tested.
//
// Readable by every signed-in role. There is no role gate here on purpose: each
// underlying read already applies its own rule (archived projects come back from
// `listProjects` for admins only) and RLS scopes the rest, so a viewer gets a
// summary of exactly the rows they may already read.

// The most runs the build tile reads for its window. An internal tool won't
// approach it even over 90 days; it exists so the query can't degrade if
// something starts triggering builds in a loop, and the tile says when it's hit.
const BUILD_WINDOW_CAP = 2000;

export const getDashboardSummary = async (filters: DashboardFilters): Promise<DashboardSummary> => {
  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000).toISOString();

  // Independent reads — run them together rather than in sequence. Always the
  // whole workspace: the client filter is applied to these in `summary.ts`, so
  // the list of clients to choose from is never itself filtered.
  const [projects, environmentRows, tracker, buildRows] = await Promise.all([
    // `true` asks for archived too; the service grants that to admins only, so
    // for anyone else the archived tally is simply 0.
    listProjects(true),
    findAllEnvironments(),
    getTrackerData(),
    findRecentBuildRuns(BUILD_WINDOW_CAP, since),
  ]);

  return buildDashboardSummary(
    {
      projects,
      environments: environmentRows.map(rowToEnvironment),
      vms: tracker.vms,
      runs: buildRows.map(rowToBuildRun),
      runsCapped: buildRows.length >= BUILD_WINDOW_CAP,
    },
    filters
  );
};
