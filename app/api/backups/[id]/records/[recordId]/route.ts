import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { deleteBackupRecord, reuploadBackup } from '@/services/backups/backupService';

type Context = { params: Promise<{ id: string; recordId: string }> };

// POST /api/backups/:id/records/:recordId — re-upload this dump to Azure
// (editor+). For a backup whose upload failed while the dump itself succeeded,
// which is the common half-failure: the file is on the host, Azure isn't.
export async function POST(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id, recordId } = await context.params;
    const data = await reuploadBackup(id, recordId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload the backup.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}

// DELETE /api/backups/:id/records/:recordId — delete the dump on the service's
// host (admin). Irreversible, and it is a backup: the one action here that can
// lose data you would want during an incident.
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
