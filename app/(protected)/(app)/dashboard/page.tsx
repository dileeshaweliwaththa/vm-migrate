import { getDashboardSummary } from '@/services/dashboard/dashboardService';
import { PageHeader } from '@/components/layout/page-header';
import { DashboardOverview } from '@/components/dashboard/dashboard-overview';

// Server-rendered: the summary is a handful of aggregate reads with no
// interaction, so it needs no hook layer — the page calls the service and hands
// the result to a pure component. Readable by every signed-in role.
export default async function DashboardPage() {
  const summary = await getDashboardSummary();

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
      />
      <DashboardOverview summary={summary} />
    </>
  );
}
