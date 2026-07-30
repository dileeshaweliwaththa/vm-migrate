import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getJenkinsRunState } from '@/services/jenkins/jenkinsService';

type Context = { params: Promise<{ id: string; envId: string }> };

// GET /api/projects/:id/environments/:envId/jenkins-run?queue=…|build=…
//
// One poll of a triggered build's state. Read-only and idempotent, so GET; Route
// Handlers aren't cached by default, and the service reads live Jenkins state, so
// no cache opt-out is needed.
//
// Pass `build` once the build URL is known and `queue` before that — the service
// resolves a queue item to its build, and queue items expire after a few minutes
// while build URLs don't.
export async function GET(request: NextRequest, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id, envId } = await context.params;
    const params = request.nextUrl.searchParams;
    const queueUrl = params.get('queue') ?? undefined;
    const buildUrl = params.get('build') ?? undefined;
    if (!queueUrl && !buildUrl) {
      return NextResponse.json({ error: 'A queue or build reference is required.' }, { status: 400 });
    }

    const result = await getJenkinsRunState(id, envId, { queueUrl, buildUrl });
    if (!result.success) {
      const status = result.message === 'Editor access required.' ? 403 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read the build state.' },
      { status: 500 }
    );
  }
}
