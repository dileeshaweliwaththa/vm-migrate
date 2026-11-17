import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getDashboardSummary } from '@/services/dashboard/dashboardService';
import { parseDashboardFilters } from '@/services/dashboard/summary';

// GET /api/dashboard?client=<tag>&days=7|30|90 — the dashboard summary narrowed
// to one client and/or a build window (any signed-in role). An unknown client or
// window falls back to all clients and 7 days; `data.filters` says what applied.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const params = new URL(request.url).searchParams;
    const filters = parseDashboardFilters({ client: params.get('client'), days: params.get('days') });
    return NextResponse.json({ data: await getDashboardSummary(filters) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load the dashboard.' },
      { status: 500 }
    );
  }
}
