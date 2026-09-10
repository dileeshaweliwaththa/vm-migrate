import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { deleteVmGroup, updateVmGroup } from '@/services/vms/vmGroupService';
import type { VmGroupInput } from '@/types/common/vm';

type Context = { params: Promise<{ id: string }> };

// PATCH /api/vm-groups/:id — rename a group or edit its notes (editor+).
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as VmGroupInput;
    const data = await updateVmGroup(id, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update the group.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}

// DELETE /api/vm-groups/:id — delete a group (editor+). Its VMs are ungrouped,
// never deleted: the FK is `on delete set null`.
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await deleteVmGroup(id);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete the group.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
