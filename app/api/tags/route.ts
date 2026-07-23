import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { listTagNames } from '@/services/tags/tagService';

// GET /api/tags — all existing tag names (for the project tag picker).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const data = await listTagNames();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load tags.' },
      { status: 500 }
    );
  }
}
