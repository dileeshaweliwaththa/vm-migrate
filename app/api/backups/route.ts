import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import {
  createBackupTarget,
  listBackupTargetSummaries,
} from '@/services/backups/backupService';
import type { BackupTargetInput } from '@/types/common/backup';

// GET /api/backups — every registered target with the facts Supabase can answer
// on its own: the configuration, the schedule, how its runs have gone, and
// whether it has a destination to write to.
//
// **No outbound call happens here**, which is the point: this is what the index
// draws with, so it answers in one round trip rather than after a MySQL
// handshake and a container listing per target. Whether a server is actually
// reachable, which databases are on it and what older dumps the container holds
// are `GET /api/backups/:id/live`, fetched per card once the page is up.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const data = await listBackupTargetSummaries();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load backup targets.' },
      { status: 500 }
    );
  }
}

// POST /api/backups — register a backup service (editor+).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as BackupTargetInput;
    const data = await createBackupTarget(body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add the backup target.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
