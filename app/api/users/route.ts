import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { listUsers, provisionUser } from '@/services/users/userService';
import { isDeniedMessage, writeStatus } from '@/lib/errors';
import type { UserRole } from '@/types/common';

// GET /api/users — list all provisioned users (admin only).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const result = await listUsers();
  if (!result.success) {
    const status = isDeniedMessage(result.message) ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ data: result.data });
}

// POST /api/users — provision a new user by email + role (admin only).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { email, role, name } = (await request.json()) as {
      email?: string;
      role?: UserRole;
      name?: string;
    };
    const response = await provisionUser(email ?? '', role ?? 'viewer', name);
    return NextResponse.json({ response }, { status: writeStatus(response, 201) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to invite user.' },
      { status: 500 }
    );
  }
}
