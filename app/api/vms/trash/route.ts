import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { clearTrash } from '@/services/vms/vmService';
import type { TrashType } from '@/types/common/vm';

// DELETE /api/vms/trash?type=upview|client — permanently empty one trash list.
// Each purged VM's migrated URLs are archived onto its destination first.
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type');
  if (type !== 'upview' && type !== 'client') {
    return NextResponse.json(
      { error: 'A valid trash type (upview | client) is required.' },
      { status: 400 }
    );
  }

  try {
    await clearTrash(type as TrashType);
    return NextResponse.json({ data: { type } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear trash.' },
      { status: 500 }
    );
  }
}
