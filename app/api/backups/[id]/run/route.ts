import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { runBackup } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string }> };

// POST /api/backups/:id/run — dump now (editor+). `{ databases: [] }` (or an
// absent list) means every database the service can see.
//
// The service answers only when the dump has finished, which can take minutes;
// the page follows progress through `/logs` in the meantime and this response is
// the summary.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { databases?: unknown };
    const databases = Array.isArray(body.databases)
      ? body.databases.filter((name): name is string => typeof name === 'string')
      : [];

    const data = await runBackup(id, databases);
    // A refused or failed *run* is a successful request whose payload says what
    // happened — the page shows it inline next to the logs.
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start the backup.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
