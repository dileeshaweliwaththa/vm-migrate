import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { restoreVm } from '@/services/vms/vmService';

type Context = { params: Promise<{ id: string }> };

// POST /api/vms/:id/restore — bring a trashed VM back to the active list.
export async function POST(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await restoreVm(id);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore VM.' },
      { status: 500 }
    );
  }
}
