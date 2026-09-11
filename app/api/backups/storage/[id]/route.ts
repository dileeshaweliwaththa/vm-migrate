import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import {
  deleteStorageAccount,
  testStorageAccount,
  updateStorageAccount,
} from '@/services/backups/backupStorageService';
import type { BackupStorageInput } from '@/types/common/backup';

type Context = { params: Promise<{ id: string }> };

// PATCH /api/backups/storage/:id — edit a destination (editor+). An empty
// `connectionString` means "keep the stored one": the GET never sends it out, so
// the form has nothing to send back.
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as BackupStorageInput;
    const data = await updateStorageAccount(id, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update the storage account.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}

// POST /api/backups/storage/:id — test it (editor+). Lists the container, which
// is the same call retention makes, so a pass means a backup has somewhere to go.
export async function POST(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const data = await testStorageAccount(id);
    // A failed *test* is a successful request whose payload says what is wrong.
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to test the storage account.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}

// DELETE /api/backups/storage/:id — remove a destination (admin).
//
// The targets that pointed at it survive with no destination (the FK is
// `on delete set null`), and **no blob is touched**: the dumps are the backups.
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await deleteStorageAccount(id);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove the storage account.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
