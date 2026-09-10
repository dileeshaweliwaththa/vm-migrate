import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { createVmGroup, listVmGroups } from '@/services/vms/vmGroupService';
import type { VmGroupInput } from '@/types/common/vm';

// GET /api/vm-groups — every VM group. The tracker payload carries these too
// (see getTrackerData); this route exists for callers that want the groups
// alone, without the whole grid.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const data = await listVmGroups();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load VM groups.' },
      { status: 500 }
    );
  }
}

// POST /api/vm-groups — create a group (editor+).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as VmGroupInput;
    const data = await createVmGroup(body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create the group.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
