import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { listJenkinsJobs } from '@/services/jenkins/jenkinsService';

type Context = { params: Promise<{ id: string; envId: string }> };

const statusFor = (message: string): number =>
  message.endsWith('access required.') ? 403 : message === 'Environment not found.' ? 404 : 400;

// GET — all jobs on this environment's Jenkins server, with status + last build.
// Any signed-in role: this listing also feeds the Status / Last build columns of
// the records table, which viewers see.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id, envId } = await context.params;
    const result = await listJenkinsJobs(id, envId);
    if (!result.success) return NextResponse.json({ error: result.message }, { status: statusFor(result.message) });
    return NextResponse.json({ data: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load Jenkins jobs.' },
      { status: 500 }
    );
  }
}
