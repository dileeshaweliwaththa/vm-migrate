import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { getVmJenkinsConfig, saveVmJenkinsConfig } from '@/services/jenkins/vmJenkinsService';
import type { VmJenkinsInput } from '@/types/common/jenkins';

type Context = { params: Promise<{ id: string }> };

// GET /api/vms/:id/jenkins — the VM's Jenkins server, secret-free (the token is
// a boolean). Open to every signed-in role: which machines run Jenkins is not a
// secret, and the tracker marks them for everyone.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const data = await getVmJenkinsConfig(id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load the Jenkins setup.' },
      { status: 500 }
    );
  }
}

// PUT /api/vms/:id/jenkins — set the server, its user and its API token
// (editor+). The token only ever travels inbound: an empty `apiToken` means
// "keep the stored one", since the GET above never sends it out.
export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Partial<VmJenkinsInput>;
    const data = await saveVmJenkinsConfig(id, {
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : '',
      username: typeof body.username === 'string' ? body.username : '',
      apiToken: typeof body.apiToken === 'string' ? body.apiToken : '',
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save the Jenkins setup.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
