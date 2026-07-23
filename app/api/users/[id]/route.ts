import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { changeUserRole, removeUser } from '@/services/users/userService';
import type { UserRole } from '@/types/common';

type Context = { params: Promise<{ id: string }> };

// PATCH /api/users/:id — change a user's role (admin only).
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const { role } = (await request.json()) as { role?: UserRole };
    const response = await changeUserRole(id, role ?? 'viewer');
    return NextResponse.json({ response }, { status: response.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update role.' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/:id — remove a user (admin only).
export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const response = await removeUser(id);
    return NextResponse.json({ response }, { status: response.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove user.' },
      { status: 500 }
    );
  }
}
