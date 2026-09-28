import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { testGithubConnection } from '@/services/github/githubService';

// POST /api/settings/github/test — re-verify the stored token and count the
// repositories it can see (admin only).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const result = await testGithubConnection();
  if (!result.success) {
    const status = result.message.endsWith('access required.') ? 403 : 400;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ data: result.data, message: result.message });
}
