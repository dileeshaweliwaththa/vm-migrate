import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getJenkinsRecordSource } from '@/services/jenkins/jenkinsService';

type Context = { params: Promise<{ id: string; envId: string; portId: string }> };

// GET /api/projects/:id/environments/:envId/ports/:portId/jenkins-source
//
// The repository and branch this record's Jenkins job builds from, read live
// from the job's config.xml. Any signed-in role — see getJenkinsRecordSource.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id, envId, portId } = await context.params;
    const result = await getJenkinsRecordSource(id, envId, portId);
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
      { error: error instanceof Error ? error.message : 'Failed to read the job config.' },
      { status: 500 }
    );
  }
}
