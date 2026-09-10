import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getBackupLogs } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string }> };

// GET /api/backups/:id/logs?since=N — the running (or most recent) session's
// progress lines after index N. Any signed-in role: watching a backup run is
// reading.
//
// Polled rather than streamed. The service offers SSE as well, but the portal
// follows Jenkins builds by polling and one mechanism is easier to reason about
// than two — and a poll survives the proxies between here and a backup host.
export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const since = Number(new URL(request.url).searchParams.get('since') ?? '0');
    const data = await getBackupLogs(id, Number.isFinite(since) ? since : 0);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load the backup log.' },
      { status: 500 }
    );
  }
}
