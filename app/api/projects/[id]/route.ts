import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getProject, updateProject, removeProject } from '@/services/projects/projectService';
import type { ProjectInput } from '@/types/common/project';

type Context = { params: Promise<{ id: string }> };

// GET /api/projects/:id — a project with its environments + ports.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const data = await getProject(id);
    if (!data) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load project.' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/:id — update project fields (editor/admin via RLS).
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = (await request.json()) as ProjectInput;
    const data = await updateProject(id, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update project.' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/:id — permanently delete (admin via RLS).
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id } = await context.params;
    await removeProject(id);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete project.' },
      { status: 500 }
    );
  }
}
