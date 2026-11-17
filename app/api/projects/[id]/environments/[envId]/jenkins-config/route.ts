import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import {
  getEnvironmentJenkinsConfig,
  saveEnvironmentJenkinsConfig,
} from '@/services/jenkins/jenkinsService';
import type { EnvironmentJenkinsInput } from '@/types/common/jenkins';

type Context = { params: Promise<{ id: string; envId: string }> };

const statusFor = (message: string): number =>
  message === 'Editor access required.' ? 403 : message === 'Environment not found.' ? 404 : 400;

// GET — this environment's Jenkins job and its VM's server (secret-free).
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { id, envId } = await context.params;
  const result = await getEnvironmentJenkinsConfig(id, envId);
  if (!result.success) return NextResponse.json({ error: result.message }, { status: statusFor(result.message) });
  return NextResponse.json({ data: result.data });
}

// PUT — save this environment's Jenkins job (editor/admin). The server and its
// credentials are the VM's, set from the tracker.
export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { id, envId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Partial<EnvironmentJenkinsInput>;
  const result = await saveEnvironmentJenkinsConfig(id, envId, {
    jenkinsUrl: body.jenkinsUrl ?? '',
  });
  if (!result.success) return NextResponse.json({ error: result.message }, { status: statusFor(result.message) });
  return NextResponse.json({ data: result.data, message: result.message });
}
