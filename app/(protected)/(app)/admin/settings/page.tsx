import { redirect } from 'next/navigation';
import { getCurrentRole } from '@/services/auth/authService';
import { isAdmin } from '@/lib/rbac';
import { SettingsManager } from '@/components/settings/settings-manager';

// Admin-only. The (app) layout enforces authentication; this adds the role gate
// (RLS and the settings service enforce it authoritatively too).
export default async function SettingsPage() {
  const role = await getCurrentRole();
  if (!isAdmin(role)) redirect('/dashboard');

  return <SettingsManager />;
}
