
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { updateVmIp, deleteVmIp } from '@/services/vms/vmService';
import type { VmIpInput } from '@/types/common/vm';

type Context = { params: Promise<{ id: string; ipId: string }> };

// PATCH /api/vms/:id/ips/:ipId — edit one of a VM's extra addresses.
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { ipId } = await context.params;
    const body = (await request.json()) as VmIpInput;
    const data = await updateVmIp(ipId, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update the IP.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}

// DELETE /api/vms/:id/ips/:ipId — remove an address. Its endpoints fall back to
// the VM's primary (`endpoints.ip_id` is `on delete set null`), so no URL is lost
// with it — which is why this is editor work rather than admin work.
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { ipId } = await context.params;
    await deleteVmIp(ipId);
    return NextResponse.json({ data: { id: ipId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete the IP.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
