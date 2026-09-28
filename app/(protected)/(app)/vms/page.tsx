import { VmsDashboard } from '@/components/vms/vms-dashboard';

// Every signed-in role: the list is read-only, and editing happens in the
// tracker behind its own role checks. The (app) layout enforces the session.
export default function VmsPage() {
  return <VmsDashboard />;
}
