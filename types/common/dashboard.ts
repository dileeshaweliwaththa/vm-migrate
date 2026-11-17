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

// How far back the build tile looks, in days (#75). The first is the default.
export const DASHBOARD_BUILD_WINDOWS = [7, 30, 90] as const;
export type DashboardBuildWindow = (typeof DASHBOARD_BUILD_WINDOWS)[number];
export const DEFAULT_DASHBOARD_BUILD_WINDOW: DashboardBuildWindow = DASHBOARD_BUILD_WINDOWS[0];

// What the dashboard is narrowed to. `client` is a project tag; null is every
// client.
export interface DashboardFilters {
  client: string | null;
  days: DashboardBuildWindow;
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  client: null,
  days: DEFAULT_DASHBOARD_BUILD_WINDOW,
};

export interface DashboardSummary {
  // The filters as applied: an unknown client or window falls back to "all" and
  // the default window, and this says which.
  filters: DashboardFilters;
  projects: {
    total: number;
    // Archived projects are only visible to admins, so this is 0 for everyone
    // else rather than a number they can't drill into.
    archived: number;
    // Distinct tag names across **all** projects, whatever the filter: the
    // client groupings, and the choices the client filter offers.
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
  // along is the migration?" without a trip to /tracker. Narrowed to a client,
  // it covers the VMs that client's environments are deployed on.
  migration: ProgressMetric[];
  builds: {
    // Runs recorded in the last `days` days, by outcome. `capped` means the
    // window held more runs than the query fetches, so the counts are a floor.
    inWindow: {
      days: DashboardBuildWindow;
      total: number;
      succeeded: number;
      failed: number;
      inFlight: number;
      capped: boolean;
    };
    recent: EnvironmentBuildRun[];
  };
}
