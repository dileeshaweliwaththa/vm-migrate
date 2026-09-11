import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import {
  createStorageAccount,
  listStorageAccounts,
} from '@/services/backups/backupStorageService';
import type { BackupStorageInput } from '@/types/common/backup';

// GET /api/backups/storage — the Azure destinations backups are written to.
// Secret-free: `hasConnectionString` is a boolean, never the string.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const data = await listStorageAccounts();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load Azure storage.' },
      { status: 500 }
    );
  }
}

// POST /api/backups/storage — add a destination (editor+). One account is shared
// by every target that points at it, so the key is entered once.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as BackupStorageInput;
    const data = await createStorageAccount(body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add the storage account.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
