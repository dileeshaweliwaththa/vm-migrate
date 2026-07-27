import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { generateProjectDocs } from '@/services/ai/aiService';

// POST /api/ai/generate-docs — generate Tiptap documentation for a project via
// Gemini (editor/admin only; the service re-checks the role). Returns editable
// content the client loads into the editor; nothing is persisted here.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { projectId } = (await request.json().catch(() => ({}))) as { projectId?: string };
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });

    const result = await generateProjectDocs(projectId);
    if (!result.success) {
      const status =
        result.message === 'Editor access required.'
          ? 403
          : result.message === 'Project not found.'
            ? 404
            : 400;
      return NextResponse.json({ error: result.message }, { status });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI generation failed.' },
      { status: 500 }
    );
  }
}
