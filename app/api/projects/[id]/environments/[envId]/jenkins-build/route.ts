import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { triggerJenkinsBuild } from '@/services/jenkins/jenkinsService';

type Context = { params: Promise<{ id: string; envId: string }> };

// POST — trigger a build of a job on this environment's Jenkins server
// (editor/admin). Body: { jobUrl }. State-changing; guarded by a confirm in UI.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id, envId } = await context.params;
    const { jobUrl } = (await request.json().catch(() => ({}))) as { jobUrl?: string };
    const result = await triggerJenkinsBuild(id, envId, jobUrl ?? '');
    if (!result.success) {
      const status = result.message === 'Editor access required.' ? 403 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }
    // `data.queueUrl` is the handle the client polls to follow this run.
    return NextResponse.json({ message: result.message, data: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to trigger the build.' },
      { status: 500 }
    );
  }
}
