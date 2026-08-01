import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { listEnvironmentBuildRuns } from '@/services/jenkins/jenkinsService';

type Context = { params: Promise<{ id: string; envId: string }> };

// GET /api/projects/:id/environments/:envId/jenkins-runs[?portId=…]
//
// Build history: which job was run, by whom, and how it ended. `portId` scopes it
// to a single record — how the UI reads it, since each record row has its own
// history. Read from our own `environment_build_runs` table (no Jenkins call), so
// it stays available to every signed-in role and survives a page reload.
export async function GET(request: NextRequest, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id, envId } = await context.params;
    const portId = request.nextUrl.searchParams.get('portId') ?? undefined;
    const result = await listEnvironmentBuildRuns(id, envId, portId);
    if (!result.success) {
      const status = result.message.endsWith('access required.')
        ? 403
        : result.message.endsWith('not found.')
          ? 404
          : 400;
      return NextResponse.json({ error: result.message }, { status });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load the build history.' },
      { status: 500 }
    );
  }
}
