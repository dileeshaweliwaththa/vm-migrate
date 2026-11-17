'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  DEFAULT_DASHBOARD_FILTERS,
  type DashboardFilters,
  type DashboardSummary,
} from '@/types/common/dashboard';

// Hook layer for the dashboard (#75). The page renders the default view on the
// server and hands it in as `initial`, so the first paint needs no fetch; a
// filter change asks `/api/dashboard` for the narrowed summary.

export const dashboardKey = (filters: DashboardFilters) => ['dashboard', filters];

const isDefault = (filters: DashboardFilters): boolean =>
  filters.client === DEFAULT_DASHBOARD_FILTERS.client &&
  filters.days === DEFAULT_DASHBOARD_FILTERS.days;

export const useDashboard = (filters: DashboardFilters, initial: DashboardSummary) =>
  useQuery({
    queryKey: dashboardKey(filters),
    queryFn: async (): Promise<DashboardSummary> => {
      const params = new URLSearchParams({ days: String(filters.days) });
      if (filters.client) params.set('client', filters.client);
      const res = await fetch(`/api/dashboard?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load the dashboard.');
      return body.data as DashboardSummary;
    },
    // Only the default view was rendered on the server.
    initialData: isDefault(filters) ? initial : undefined,
    // Keep the last numbers on screen while the next filter loads, rather than
    // flashing back to skeletons on every click.
    placeholderData: keepPreviousData,
  });
