import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { checkGeminiStatus } from '@/services/ai/aiService';

// GET /api/ai/status — live Gemini health/quota check for Settings (editor/admin).
// Returns a graceful status (never a raw provider error), including retry timing
// when a quota/rate limit is hit.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const result = await checkGeminiStatus();
  if (!result.success) {
    const status = result.message === 'Editor access required.' ? 403 : 400;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ data: result.data });
}
