import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getGithubStatus, saveGithubToken } from '@/services/github/githubService';

const statusFor = (message: string): number =>
  message.endsWith('access required.') ? 403 : 400;

// GET /api/settings/github — whether a token is set and which account it is
// (admin only). Never the token itself.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const result = await getGithubStatus();
  if (!result.success) return NextResponse.json({ error: result.message }, { status: statusFor(result.message) });
  return NextResponse.json({ data: result.data });
}

// PUT /api/settings/github — { token } (admin only). Verified against GitHub
// before it is stored; an empty token disconnects.
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    const result = await saveGithubToken(token);
    if (!result.success) return NextResponse.json({ error: result.message }, { status: statusFor(result.message) });
    return NextResponse.json({ data: result.data, message: result.message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save the GitHub token.' },
      { status: 500 }
    );
  }
}
