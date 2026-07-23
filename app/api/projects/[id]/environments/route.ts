import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { addEnvironment } from '@/services/environments/environmentService';
import type { EnvironmentInput } from '@/types/common/project';

type Context = { params: Promise<{ id: string }> };

// POST /api/projects/:id/environments — add an environment (editor/admin).
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as EnvironmentInput;
    const data = await addEnvironment(id, body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add environment.' },
      { status: 500 }
    );
  }
}
