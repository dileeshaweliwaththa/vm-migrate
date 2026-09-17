import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { addVmIp } from '@/services/vms/vmService';
import type { VmIpInput } from '@/types/common/vm';

type Context = { params: Promise<{ id: string }> };

// POST /api/vms/:id/ips — give a VM another public address.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as VmIpInput;
    const data = await addVmIp(id, body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add the IP.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
