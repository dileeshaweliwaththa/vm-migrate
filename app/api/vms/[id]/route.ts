import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { getVmDetail, updateVm, trashVm } from '@/services/vms/vmService';
import type { VmInput } from '@/types/common/vm';

type Context = { params: Promise<{ id: string }> };

// GET /api/vms/:id — one machine and everything tied to it, for the VM page
// (docs/vms.md). Any signed-in role, like the tracker. 404 for an unknown or
// trashed id.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const data = await getVmDetail(id);
    if (!data) return NextResponse.json({ error: 'VM not found.' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load the VM.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}

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
      { status: isForbidden(error) ? 403 : 500 }
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
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
