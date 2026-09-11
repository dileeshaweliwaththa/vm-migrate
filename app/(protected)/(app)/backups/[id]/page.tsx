import { getCurrentRole } from '@/services/auth/authService';
import { canEdit, isAdmin } from '@/lib/rbac';
import { BackupTargetDetail } from '@/components/backups/backup-target-detail';

// One backup target: its configuration, the databases it dumps, the live log and
// its history. The role is resolved here and handed down to decide which controls
// render — `backupService` re-checks every action, and it is the layer that talks
// to the backup host.
export default async function BackupTargetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await getCurrentRole();

  return (
    <BackupTargetDetail targetId={id} canEdit={canEdit(role)} canPurge={isAdmin(role)} />
  );
}
