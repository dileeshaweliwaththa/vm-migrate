import { getDashboardSummary } from '@/services/dashboard/dashboardService';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { DEFAULT_DASHBOARD_FILTERS } from '@/types/common/dashboard';

// The default view (every client, the last 7 days) is rendered here on the
// server, so the page arrives with its numbers. The filters then refetch through
// the hook and `/api/dashboard`. Readable by every signed-in role.
export default async function DashboardPage() {
  const summary = await getDashboardSummary(DEFAULT_DASHBOARD_FILTERS);
  return <DashboardView initial={summary} />;
}
