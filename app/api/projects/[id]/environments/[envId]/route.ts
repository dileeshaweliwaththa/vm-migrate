import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { updateEnvironment, removeEnvironment } from '@/services/environments/environmentService';
import type { EnvironmentInput } from '@/types/common/project';

type Context = { params: Promise<{ id: string; envId: string }> };

// PATCH /api/projects/:id/environments/:envId — update an environment.
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { envId } = await context.params;
    const body = (await request.json()) as EnvironmentInput;
    const data = await updateEnvironment(envId, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update environment.' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/:id/environments/:envId — remove an environment.
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { envId } = await context.params;
    await removeEnvironment(envId);
    return NextResponse.json({ data: { id: envId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove environment.' },
      { status: 500 }
    );
  }
}
