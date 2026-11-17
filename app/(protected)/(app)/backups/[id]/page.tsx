import { notFound } from 'next/navigation';
import { getCurrentRole } from '@/services/auth/authService';
import { backupTargetExists } from '@/services/backups/backupService';
import { isAdmin } from '@/lib/rbac';
import { BackupTargetDetail } from '@/components/backups/backup-target-detail';

// One backup target: its configuration, the databases it dumps, the live log and
// its history.
//
// Readable by every signed-in role; **every action is admin's**. The role is
// resolved here and handed down to decide which controls render, which is only an
// affordance — `backupService` re-checks it on every action, and that is the
// layer holding the database password.
export default async function BackupTargetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [role, exists] = await Promise.all([getCurrentRole(), backupTargetExists(id)]);

  // A stale or mistyped link renders the in-shell 404.
  if (!exists) notFound();

  return <BackupTargetDetail targetId={id} canManage={isAdmin(role)} />;
}
