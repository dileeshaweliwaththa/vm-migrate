import { redirect } from 'next/navigation';
import { getCurrentRole } from '@/services/auth/authService';
import { isAdmin } from '@/lib/rbac';
import { UsersManager } from '@/components/users/users-manager';

// Admin-only. The (app) layout already enforces authentication; this adds the
// role gate (RLS and the service layer enforce it authoritatively too).
export default async function UsersPage() {
  const role = await getCurrentRole();
  if (!isAdmin(role)) redirect('/dashboard');

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <UsersManager />
    </div>
  );
}
