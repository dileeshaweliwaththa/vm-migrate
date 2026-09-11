import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { streamBackupEvents } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string }> };

// GET /api/backups/:id/stream — the worker's live backup progress, proxied as
// Server-Sent Events. Any signed-in role: watching a run is reading.
//
// Proxied rather than subscribed to directly from the browser, for the same
// reasons the download is: the worker sits on an address the browser may not
// reach, and its API has no authentication of its own.
//
// This is the channel that carries a run's progress. The worker's persisted-log
// endpoint writes to its own MySQL fire-and-forget, so where those tables are
// missing it answers with an empty list forever — the stream does not depend on
// them.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await streamBackupEvents(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }

  // Piped through untouched. `X-Accel-Buffering: no` is what keeps a proxy from
  // holding the lines back until the stream ends — which, for a subscription
  // that never ends, would mean showing nothing at all.
  return new Response(result.response.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
