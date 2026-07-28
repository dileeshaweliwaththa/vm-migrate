import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { listGeminiModels } from '@/services/ai/aiService';

// GET /api/ai/models — Gemini models the configured key supports (editor/admin).
// Powers the model dropdown in Settings. Returns [] with a message when no key
// is configured yet, so the UI can fall back to a static list.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const result = await listGeminiModels();
  if (!result.success) {
    const status = result.message === 'Editor access required.' ? 403 : 400;
    return NextResponse.json({ error: result.message, data: [] }, { status });
  }
  return NextResponse.json({ data: result.data });
}
