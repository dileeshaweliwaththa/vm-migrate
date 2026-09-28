import { redirect } from 'next/navigation';
import { getCurrentRole } from '@/services/auth/authService';
import { isAdmin } from '@/lib/rbac';
import { SettingsManager } from '@/components/settings/settings-manager';
import { DEFAULT_SETTINGS_SECTION, isSettingsSection } from '@/types/common/settings';

// Admin-only. The (app) layout enforces authentication; this adds the role gate
// (RLS and the settings service enforce it authoritatively too).
//
// `?section=` picks the category shown first, so one can be linked to directly
// (`/admin/settings?section=github`). Anything unrecognised falls back to the
// first category rather than an empty page.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const role = await getCurrentRole();
  if (!isAdmin(role)) redirect('/dashboard');

  const { section } = await searchParams;
  return (
    <SettingsManager
      initialSection={isSettingsSection(section) ? section : DEFAULT_SETTINGS_SECTION}
    />
  );
}
