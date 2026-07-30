import { getCurrentRole } from '@/services/auth/authService';
import { canEdit, isAdmin } from '@/lib/rbac';
import { ProjectsDashboard } from '@/components/projects/projects-dashboard';

export default async function ProjectsPage() {
  const role = await getCurrentRole();
  // `isAdmin` gates the archived filter: archived projects are admin-only. The
  // service re-checks the role, so this only decides whether the UI offers it.
  return <ProjectsDashboard canEdit={canEdit(role)} isAdmin={isAdmin(role)} />;
}
