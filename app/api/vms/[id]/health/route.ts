import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { checkVmHealth } from '@/services/vms/vmHealthService';

type Context = { params: Promise<{ id: string }> };

// GET /api/vms/:id/health — probe every endpoint on the machine and report up /
// down / skipped with status and timing (docs/vms.md). Any signed-in role; the
// rules on what is and isn't probed are in vmHealthService and docs/security.md.
// A GET because it changes nothing: results are not stored.
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const data = await checkVmHealth(id);
    if (!data) return NextResponse.json({ error: 'VM not found.' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Health check failed.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
