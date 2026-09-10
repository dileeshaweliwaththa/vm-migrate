import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { assignVmsToGroup } from '@/services/vms/vmGroupService';

// POST /api/vm-groups/assign — file a selection of VMs under one group, or
// ungroup them with `groupId: null` (editor+).
//
// One route for both directions, and one request for the whole selection: the
// UI's action is "these VMs belong to this group", which is a single decision
// even when it covers eight machines. A per-VM PATCH would half-apply.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      vmIds?: unknown;
      groupId?: unknown;
    };

    if (!Array.isArray(body.vmIds)) {
      return NextResponse.json({ error: 'vmIds must be an array.' }, { status: 400 });
    }
    // `null` is the ungroup case and a string is a target group; anything else
    // is a malformed request, not an ungroup — so it's rejected rather than
    // silently emptying every selected VM's group.
    if (body.groupId !== null && typeof body.groupId !== 'string') {
      return NextResponse.json(
        { error: 'groupId must be a group id or null.' },
        { status: 400 }
      );
    }

    const vmIds = body.vmIds.filter((id): id is string => typeof id === 'string');
    const updated = await assignVmsToGroup(vmIds, body.groupId);
    return NextResponse.json({ data: { vmIds: updated, groupId: body.groupId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to group the VMs.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
