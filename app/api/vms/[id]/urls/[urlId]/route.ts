import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { updateUrl, deleteUrl } from '@/services/vms/vmService';
import type { VmUrlInput } from '@/types/common/vm';

type Context = { params: Promise<{ id: string; urlId: string }> };

// PATCH /api/vms/:id/urls/:urlId — update a URL row.
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { urlId } = await context.params;
    const body = (await request.json()) as VmUrlInput;
    const data = await updateUrl(urlId, body);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update URL.' },
      { status: 500 }
    );
  }
}

// DELETE /api/vms/:id/urls/:urlId — remove a URL row.
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { urlId } = await context.params;
    await deleteUrl(urlId);
    return NextResponse.json({ data: { id: urlId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete URL.' },
      { status: 500 }
    );
  }
}
