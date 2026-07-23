import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { updatePort, removePort } from '@/services/environments/environmentService';
import type { EnvironmentPortInput } from '@/types/common/project';

type Context = { params: Promise<{ id: string; envId: string; portId: string }> };

// PATCH /api/projects/:id/environments/:envId/ports/:portId — update a port.
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { portId } = await context.params;
    const body = (await request.json()) as EnvironmentPortInput;
    const data = await updatePort(portId, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update port.' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/:id/environments/:envId/ports/:portId — delete a port.
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { portId } = await context.params;
    await removePort(portId);
    return NextResponse.json({ data: { id: portId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete port.' },
      { status: 500 }
    );
  }
}
