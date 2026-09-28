import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { listGithubBranches } from '@/services/github/githubService';

// GET /api/github/branches?repo=owner/name — a repository's branches, for the
// record source picker (editor+).
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const repo = request.nextUrl.searchParams.get('repo') ?? '';
  const result = await listGithubBranches(repo);
  if (!result.success) {
    const status = result.message.endsWith('access required.')
      ? 403
      : result.message.startsWith('Pass a repository')
        ? 400
        : 502;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ data: result.data });
}
