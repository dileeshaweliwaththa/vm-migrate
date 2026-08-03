import type { EnvironmentBuildRun } from '@/types/common/jenkins';
import type { CicdProvider, EnvironmentName, PortSource } from '@/types/common/project';

// Domain types for the Phase 3 dashboard summary. Everything here is derived —
// the dashboard owns no tables of its own, it just counts what the projects,
// environments and VM-tracker slices already store.

// A named count, used for the small breakdown rows (by stage, by provider, by
// source). A plain list rather than a Record so the UI can render it in a fixed,
// meaningful order instead of whatever key order it happens to get.
export interface CountBreakdown<T extends string = string> {
  key: T;
  label: string;
  count: number;
}

// A ratio worth showing as a progress bar: "18 of 24 VMs migrated".
export interface ProgressMetric {
  label: string;
  done: number;
  total: number;
}

export interface DashboardSummary {
  projects: {
    total: number;
    // Archived projects are only visible to admins, so this is 0 for everyone
    // else rather than a number they can't drill into.
    archived: number;
    // Distinct tag names across all projects — the client groupings.
    clients: string[];
  };
  environments: {
    total: number;
    byStage: CountBreakdown<EnvironmentName>[];
    byProvider: CountBreakdown<CicdProvider>[];
    // Environments wired to a Jenkins server (a URL is set).
    withJenkins: number;
    // Environments linked to a VM in the tracker.
    linkedToVm: number;
  };
  records: {
    total: number;
    bySource: CountBreakdown<PortSource>[];
    // Records that resolve to a reachable URL (see lib/endpoints.ts).
    reachable: number;
  };
  // The VM tracker's own migration progress, so the dashboard answers "how far
  // along is the migration?" without a trip to /tracker.
  migration: ProgressMetric[];
  builds: {
    // Runs recorded in the last 7 days, by outcome.
    lastWeek: { total: number; succeeded: number; failed: number; inFlight: number };
    recent: EnvironmentBuildRun[];
  };
}
