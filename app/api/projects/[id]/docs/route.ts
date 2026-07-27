import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getProjectDoc, saveProjectDoc } from '@/services/docs/docService';
import type { ProjectDocInput } from '@/types/common/doc';

type Context = { params: Promise<{ id: string }> };

// GET /api/projects/:id/docs — the project's documentation (null if none yet).
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const data = await getProjectDoc(id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load documentation.' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/:id/docs — save the doc (editor/admin via RLS). HTML is
// re-derived server-side from the JSON.
export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = (await request.json()) as ProjectDocInput;
    if (!body?.contentJson) {
      return NextResponse.json({ error: 'contentJson is required.' }, { status: 400 });
    }
    const data = await saveProjectDoc(id, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save documentation.' },
      { status: 500 }
    );
  }
}
