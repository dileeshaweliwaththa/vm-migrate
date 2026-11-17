'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { DashboardOverview } from '@/components/dashboard/dashboard-overview';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/hooks/dashboard/useDashboard';
import {
  DASHBOARD_BUILD_WINDOWS,
  DEFAULT_DASHBOARD_FILTERS,
  type DashboardBuildWindow,
  type DashboardFilters,
  type DashboardSummary,
} from '@/types/common/dashboard';

// Radix Select can't use an empty value for an item, so "every client" needs a
// value of its own. Never a tag name: tags are user text, this is not.
const ALL_CLIENTS = '__all__';

// The dashboard with its two filters (#75): one client, and how far back the
// build tile looks. The page renders the default view on the server and passes it
// in as `initial`; a filter change refetches through `useDashboard`, keeping the
// last numbers on screen (dimmed) until the new ones arrive.
export function DashboardView({ initial }: { initial: DashboardSummary }) {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_DASHBOARD_FILTERS);
  const { data, error, isFetching, isPlaceholderData } = useDashboard(filters, initial);
  const summary = data ?? initial;

  return (
    <>
      <PageHeader
        title="Dashboard"
        stats={
          <>
            <span>
              Projects: <b className="text-foreground">{summary.projects.total}</b>
            </span>
            <span>
              Environments: <b className="text-foreground">{summary.environments.total}</b>
            </span>
            <span>
              Records: <b className="text-foreground">{summary.records.total}</b>
            </span>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {summary.projects.clients.length > 0 ? (
              <Select
                value={filters.client ?? ALL_CLIENTS}
                onValueChange={(value) =>
                  setFilters((f) => ({ ...f, client: value === ALL_CLIENTS ? null : value }))
                }
              >
                <SelectTrigger className="w-44" aria-label="Client">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
                  {summary.projects.clients.map((client) => (
                    <SelectItem key={client} value={client}>
                      {client}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              size="sm"
              value={String(filters.days)}
              onValueChange={(value) =>
                value && setFilters((f) => ({ ...f, days: Number(value) as DashboardBuildWindow }))
              }
              aria-label="Build window"
            >
              {DASHBOARD_BUILD_WINDOWS.map((days) => (
                <ToggleGroupItem key={days} value={String(days)} aria-label={`Last ${days} days`}>
                  {days}d
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        }
      />
      {error ? (
        <p className="px-4 text-body-sm text-destructive sm:px-8" role="alert">
          {error instanceof Error ? error.message : 'Failed to load the dashboard.'} Showing the last
          numbers that loaded.
        </p>
      ) : null}
      <div
        className={cn('transition-opacity', isFetching && isPlaceholderData && 'opacity-60')}
        aria-busy={isFetching}
      >
        <DashboardOverview summary={summary} />
      </div>
    </>
  );
}
