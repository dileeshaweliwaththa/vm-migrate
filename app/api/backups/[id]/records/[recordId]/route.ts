import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { deleteBackupRecord } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string; recordId: string }> };

// DELETE /api/backups/:id/records/:recordId — delete the dump from Azure
// (admin). Irreversible, and it is a backup: the one action here that can lose
// data you would want during an incident. The `backup_runs` row stays, so the
// history still shows that a backup was taken and then removed.
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id, recordId } = await context.params;
    const data = await deleteBackupRecord(id, recordId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete the backup.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
