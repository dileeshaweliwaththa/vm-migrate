import { getCurrentRole } from '@/services/auth/authService';
import { DEFAULT_ROLE } from '@/lib/rbac';
import { BackupsDashboard } from '@/components/backups/backups-dashboard';

// Backups is readable by every signed-in role, so the role is resolved here and
// handed to the page to decide which controls to render. Hiding a control is only
// an affordance — `backupService` re-checks the role on every action, and it is
// the layer that talks to the backup hosts.
export default async function BackupsPage() {
  const role = (await getCurrentRole()) ?? DEFAULT_ROLE;
  return <BackupsDashboard role={role} />;
}
