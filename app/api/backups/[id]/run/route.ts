import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { runBackup } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string }> };

// POST /api/backups/:id/run — dump now (editor+). `{ databases: [] }` (or an
// absent list) means every database on the server.
//
// Answers as soon as the run has **started**: the dump is performed by this app
// (`backupRunner`) and takes minutes, so holding the request open would only
// invite a proxy to time it out. Progress and the outcome go to
// `backup_run_events` / `backup_runs`, which is what `/logs` and the history
// read.
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
