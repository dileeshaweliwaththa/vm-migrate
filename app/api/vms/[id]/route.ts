import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { updateVm, trashVm } from '@/services/vms/vmService';
import type { VmInput } from '@/types/common/vm';

type Context = { params: Promise<{ id: string }> };

// PATCH /api/vms/:id — update editable VM fields.
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as VmInput;
    const data = await updateVm(id, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update VM.' },
      { status: 500 }
    );
  }
}

// DELETE /api/vms/:id — soft delete (move the VM to the trash).
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await trashVm(id);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete VM.' },
      { status: 500 }
    );
  }
}
