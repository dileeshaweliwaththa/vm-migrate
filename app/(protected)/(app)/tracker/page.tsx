import { getCurrentRole } from '@/services/auth/authService';
import { DEFAULT_ROLE } from '@/lib/rbac';
import { VmTracker } from '@/components/vms/vm-tracker';

// The tracker is readable by every signed-in role, so the role is resolved here
// and handed to the grid to decide which controls to render. Hiding a control is
// only an affordance — the service layer and RLS are what actually enforce it.
export default async function TrackerPage() {
  const role = (await getCurrentRole()) ?? DEFAULT_ROLE;
  return <VmTracker role={role} />;
}
