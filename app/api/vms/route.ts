import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getTrackerData, createVm } from '@/services/vms/vmService';
import type { VmInput } from '@/types/common/vm';

// GET /api/vms — full tracker payload (active + trashed VMs, each with URLs).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const data = await getTrackerData();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load VMs.' },
      { status: 500 }
    );
  }
}

// POST /api/vms — create a VM (empty body creates a blank row).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as VmInput;
    const data = await createVm(body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create VM.' },
      { status: 500 }
    );
  }
}
