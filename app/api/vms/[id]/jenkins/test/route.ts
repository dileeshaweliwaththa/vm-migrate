import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { testVmJenkinsConnection } from '@/services/jenkins/vmJenkinsService';
import type { VmJenkinsInput } from '@/types/common/jenkins';

type Context = { params: Promise<{ id: string }> };

// POST /api/vms/:id/jenkins/test — ask this VM's Jenkins whether it answers, and
// whether these credentials work on it (editor+).
//
// The body is optional: send `baseUrl`/`username`/`apiToken` to test what is
// typed in the form before saving it, or send nothing to re-test what is stored
// (which is the only way to test a token, since the browser never has it).
//
// The result is a message, not a payload: nothing from the Jenkins response is
// forwarded to the client beyond its version and status.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Partial<VmJenkinsInput>;
    const data = await testVmJenkinsConnection(id, {
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
      username: typeof body.username === 'string' ? body.username : undefined,
      apiToken: typeof body.apiToken === 'string' ? body.apiToken : undefined,
    });
    // A failed *test* is a successful request — the outcome is the payload, so
    // the dialog can show which part is wrong rather than a generic error.
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to test the connection.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
