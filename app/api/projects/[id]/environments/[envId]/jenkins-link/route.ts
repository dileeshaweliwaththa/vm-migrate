import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { linkJenkinsJob } from '@/services/jenkins/jenkinsService';

type Context = { params: Promise<{ id: string; envId: string }> };

const statusFor = (message: string): number =>
  message === 'Editor access required.' ? 403 : message === 'Environment not found.' ? 404 : 400;

// POST — set a chosen job as this environment's Jenkins job (and copy its
// description into notes). Body: { jobUrl, description? }. Editor/admin.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id, envId } = await context.params;
    const { jobUrl, description } = (await request.json().catch(() => ({}))) as {
      jobUrl?: string;
      description?: string;
    };
    if (!jobUrl) return NextResponse.json({ error: 'jobUrl is required.' }, { status: 400 });

    const result = await linkJenkinsJob(id, envId, jobUrl, description ?? '');
    if (!result.success) return NextResponse.json({ error: result.message }, { status: statusFor(result.message) });
    return NextResponse.json({ data: result.data, message: result.message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to link the job.' },
      { status: 500 }
    );
  }
}
