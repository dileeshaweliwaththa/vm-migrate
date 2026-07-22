import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { purgeVm } from '@/services/vms/vmService';

type Context = { params: Promise<{ id: string }> };

// DELETE /api/vms/:id/purge — permanently remove a trashed VM. Migrated URLs
// are archived onto the destination VM by the service before deletion.
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await purgeVm(id);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to permanently delete VM.' },
      { status: 500 }
    );
  }
}
