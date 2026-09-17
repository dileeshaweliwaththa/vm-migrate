import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { moveVmIp } from '@/services/vms/vmService';
import type { VmIpMoveInput } from '@/types/common/vm';

// A static segment beside `[ipId]`, which Next resolves first — so `/ips/move` is
// this handler and `/ips/<uuid>` is the one next door.
type Context = { params: Promise<{ id: string }> };

// POST /api/vms/:id/ips/move — take another VM's public address onto this one:
// the address lands here with its provenance, that VM's URLs come with it, and
// the machine it came from goes to the trash.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as VmIpMoveInput;
    if (!body?.sourceVmId) {
      return NextResponse.json({ error: 'Name the VM the address is coming from.' }, { status: 400 });
    }
    const data = await moveVmIp(id, body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to move the IP.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
