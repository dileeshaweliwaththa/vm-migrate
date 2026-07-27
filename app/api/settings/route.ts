import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { getSettings, saveSettings } from '@/services/settings/settingsService';
import type { AppSettingsInput } from '@/types/common/settings';

// GET /api/settings — the global app settings, secrets masked (admin only).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const result = await getSettings();
  if (!result.success) {
    const status = result.message === 'Admin access required.' ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ data: result.data });
}

// PATCH /api/settings — update settings (admin only). Omitted secrets are kept.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as AppSettingsInput;
    const result = await saveSettings(body);
    if (!result.success) {
      const status = result.message === 'Admin access required.' ? 403 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save settings.' },
      { status: 500 }
    );
  }
}
