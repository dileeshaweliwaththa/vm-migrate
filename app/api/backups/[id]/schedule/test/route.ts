import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { testBackupSchedule } from '@/services/backups/backupCronService';

type Context = { params: Promise<{ id: string }> };

// POST /api/backups/:id/schedule/test — does this target's schedule work?
// Admin only (the service enforces it).
//
// Checks the pg_cron job, the Vault secrets and the last firing, then has
// Postgres send one real request to `/api/backups/cron` with `{"test": true}`,
// which that route answers without starting a dump. A failing check names the
// link that is broken.
//
// Takes a few seconds: pg_net answers asynchronously, so the service polls for
// the response rather than guessing.
export async function POST(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    // A failing test is a successful request whose payload says what is wrong —
    // the panel renders the checks either way.
    return NextResponse.json({ data: await testBackupSchedule(id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to test the schedule.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
