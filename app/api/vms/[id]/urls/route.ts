import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { addUrl } from '@/services/vms/vmService';
import type { VmUrlInput } from '@/types/common/vm';

type Context = { params: Promise<{ id: string }> };

// POST /api/vms/:id/urls — add a URL row to a VM.
export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as VmUrlInput;
    const data = await addUrl(id, body);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add URL.' },
      { status: 500 }
    );
  }
}
