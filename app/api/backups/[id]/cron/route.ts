import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { setWorkerCronEnabled } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string }> };

// POST /api/backups/:id/cron — turn the schedule on or off (admin).
//
// Takes the state you want (`{ enabled: boolean }`), not "flip it". The service's
// own endpoint is a bare toggle, so the service layer reads the current state
// first and only calls it when the two disagree — otherwise two clicks racing
// each other would leave the schedule wherever they happened to land.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be true or false.' }, { status: 400 });
    }

    const data = await setWorkerCronEnabled(id, body.enabled);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to change the schedule.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
