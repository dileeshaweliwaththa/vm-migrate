import { getCurrentRole } from '@/services/auth/authService';
import { canEdit } from '@/lib/rbac';
import { VmDetailView } from '@/components/vms/vm-detail';

// A machine's own page (docs/vms.md). Readable by every signed-in role, like the
// tracker; the role only decides which controls render (the Jenkins connection
// test is an editor action). The service and RLS enforce the rest.
export default async function VmPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, role] = await Promise.all([params, getCurrentRole()]);
  return <VmDetailView id={id} canEdit={canEdit(role)} />;
}
