import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import {
  deleteBackupTarget,
  getBackupTargetOverview,
  updateBackupTarget,
} from '@/services/backups/backupService';
import type { BackupTargetInput } from '@/types/common/backup';

type Context = { params: Promise<{ id: string }> };

// GET /api/backups/:id — one service's state, databases and history. Used to
// refresh a single card after a run without re-reading every other host.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const data = await getBackupTargetOverview(id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load the backup target.' },
      { status: 500 }
    );
  }
}

// PATCH /api/backups/:id — edit the registry entry (editor+).
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as BackupTargetInput;
    const data = await updateBackupTarget(id, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update the backup target.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}

// DELETE /api/backups/:id — unregister a service (admin). The dumps themselves
// are untouched: they live on the service's host and in Azure.
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await deleteBackupTarget(id);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove the backup target.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
