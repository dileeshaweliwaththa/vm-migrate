import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { syncEnvironmentPorts } from '@/services/jenkins/jenkinsService';

type Context = { params: Promise<{ id: string; envId: string }> };

// POST /api/projects/:id/environments/:envId/jenkins-sync — pull this
// environment's Jenkins job config and refresh its jenkins-sourced ports
// (editor/admin; the service re-checks the role and reads the token server-side).
export async function POST(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { id, envId } = await context.params;
  const result = await syncEnvironmentPorts(id, envId);
  if (!result.success) {
    const status =
      result.message === 'Editor access required.'
        ? 403
        : result.message === 'Environment not found.'
          ? 404
          : 400;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ data: result.data, message: result.message });
}
