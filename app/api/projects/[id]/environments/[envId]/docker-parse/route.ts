import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { previewDockerImport } from '@/services/docker/dockerService';

type Context = { params: Promise<{ id: string; envId: string }> };

// POST /api/projects/:id/environments/:envId/docker-parse
//
// Parses pasted `docker ps` output into importable records and flags which host
// ports the environment already tracks. POST because the paste goes in the body
// (it's multi-line and can be long), but this writes nothing — the UI imports a
// chosen candidate through the existing ports endpoint.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { id, envId } = await context.params;
    const { output } = (await request.json().catch(() => ({}))) as { output?: string };
    const result = await previewDockerImport(id, envId, output ?? '');
    if (!result.success) {
      const status =
        result.message === 'Editor access required.'
          ? 403
          : result.message === 'Environment not found.'
            ? 404
            : 400;
      return NextResponse.json({ error: result.message }, { status });
    }
    return NextResponse.json({ data: result.data, message: result.message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse the output.' },
      { status: 500 }
    );
  }
}
