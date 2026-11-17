import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import {
  previewEnvironmentPortSync,
  syncEnvironmentPorts,
  SYNC_PLAN_CHANGED,
} from '@/services/jenkins/jenkinsService';

type Context = { params: Promise<{ id: string; envId: string }> };

const statusFor = (message: string): number =>
  message === 'Editor access required.'
    ? 403
    : message === 'Environment not found.'
      ? 404
      : message === SYNC_PLAN_CHANGED
        ? 409
        : 400;

// GET /api/projects/:id/environments/:envId/jenkins-sync — what a sync of this
// environment's ports would change (added / unchanged / removed / kept, plus what
// couldn't be mapped). Reads the job config; writes nothing (editor/admin; the
// service re-checks the role and reads the token server-side).
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { id, envId } = await context.params;
  const result = await previewEnvironmentPortSync(id, envId);
  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: statusFor(result.message) });
  }
  return NextResponse.json({ data: result.data, message: result.message });
}

// POST /api/projects/:id/environments/:envId/jenkins-sync — apply the previewed
// sync. Body: `{ fingerprint }` from the preview. The plan is recomputed
// server-side and applied only if it still matches; otherwise 409.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { fingerprint?: unknown } | null;
  if (typeof body?.fingerprint !== 'string') {
    return NextResponse.json(
      { error: 'Preview the sync first: the request has no fingerprint.' },
      { status: 400 }
    );
  }

  const { id, envId } = await context.params;
  const result = await syncEnvironmentPorts(id, envId, body.fingerprint);
  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: statusFor(result.message) });
  }
  return NextResponse.json({ data: result.data, message: result.message });
}
