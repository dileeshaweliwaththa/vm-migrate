import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import {
  createBackupTarget,
  listBackupTargetOverviews,
} from '@/services/backups/backupService';
import type { BackupTargetInput } from '@/types/common/backup';

// GET /api/backups — every registered backup service with its live state,
// databases and history. One request for the whole page; a service that can't be
// reached comes back with `status.reachable = false` rather than failing the
// response, because the other services' histories are still worth showing.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const data = await listBackupTargetOverviews();
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
