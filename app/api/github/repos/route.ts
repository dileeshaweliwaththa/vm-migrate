import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { listGithubRepos } from '@/services/github/githubService';

// GET /api/github/repos — repositories the app's GitHub token can see, for the
// record source picker (editor+). `configured: false` when no token is set.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const result = await listGithubRepos();
  if (!result.success) {
    const status = result.message.endsWith('access required.') ? 403 : 502;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ data: result.data });
}
