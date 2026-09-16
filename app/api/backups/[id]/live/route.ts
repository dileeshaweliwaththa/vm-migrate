import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getBackupTargetLive } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string }> };

// GET /api/backups/:id/live — the half of a target's state that only another
// host can answer: whether its MySQL server is reachable, which databases are on
// it, and which dumps sit in the Azure container with no `backup_runs` row.
//
// **This is the slow route, on purpose.** It opens a MySQL connection and lists
// a blob container, which together are seconds; everything else the Backups
// pages render comes from Supabase via `GET /api/backups` and answers in one
// round trip. Splitting them is what lets a card paint immediately and fill in
// its database count afterwards, rather than the whole page waiting on the
// slowest thing on it.
//
// Any signed-in role, like the rest of the tab's reads.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const data = await getBackupTargetLive(id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check the backup target.' },
      { status: 500 }
    );
  }
}
