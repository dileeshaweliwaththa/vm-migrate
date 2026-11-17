import { notFound } from 'next/navigation';
import { getCurrentRole } from '@/services/auth/authService';
import { vmExists } from '@/services/vms/vmService';
import { canEdit } from '@/lib/rbac';
import { VmDetailView } from '@/components/vms/vm-detail';

// A machine's own page (docs/vms.md). Readable by every signed-in role, like the
// tracker; the role only decides which controls render (the Jenkins connection
// test is an editor action). The service and RLS enforce the rest.
export default async function VmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [role, exists] = await Promise.all([getCurrentRole(), vmExists(id)]);

  // A stale or mistyped link, or a VM in the trash, renders the in-shell 404.
  if (!exists) notFound();

  return <VmDetailView id={id} canEdit={canEdit(role)} />;
}
