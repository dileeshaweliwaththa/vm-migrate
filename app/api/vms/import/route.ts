import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { isForbidden } from '@/lib/errors';
import { importTracker } from '@/services/vms/vmService';
import type { TrackerData } from '@/types/common/vm';

// POST /api/vms/import — replace ALL tracker data with an uploaded backup.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<TrackerData>;
    if (!body || !Array.isArray(body.vms)) {
      return NextResponse.json(
        { error: 'Invalid backup file: expected a { vms, deleted } payload.' },
        { status: 400 }
      );
    }
    await importTracker({ vms: body.vms, deleted: body.deleted ?? [] });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import data.' },
      { status: isForbidden(error) ? 403 : 500 }
    );
  }
}
