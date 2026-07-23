import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { addPort } from '@/services/environments/environmentService';
import type { EnvironmentPortInput } from '@/types/common/project';

type Context = { params: Promise<{ id: string; envId: string }> };

// POST /api/projects/:id/environments/:envId/ports — add a port row.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { envId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as EnvironmentPortInput;
    const data = await addPort(envId, body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add port.' },
      { status: 500 }
    );
  }
}
