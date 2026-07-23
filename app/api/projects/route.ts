import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { listProjects, createProject } from '@/services/projects/projectService';
import type { ProjectInput } from '@/types/common/project';

// GET /api/projects — all active projects (with environment counts).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const includeArchived = new URL(request.url).searchParams.get('archived') === 'true';
    const data = await listProjects(includeArchived);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load projects.' },
      { status: 500 }
    );
  }
}

// POST /api/projects — create a project (editor/admin; enforced by RLS).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as ProjectInput;
    const data = await createProject(body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create project.' },
      { status: 500 }
    );
  }
}
