import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { setProjectArchived } from '@/services/projects/projectService';

type Context = { params: Promise<{ id: string }> };

// POST /api/projects/:id/archive — soft-archive or restore (editor/admin).
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const { archived } = (await request.json().catch(() => ({}))) as { archived?: boolean };
    const data = await setProjectArchived(id, archived ?? true);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to archive project.' },
      { status: 500 }
    );
  }
}
