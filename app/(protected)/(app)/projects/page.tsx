import { getCurrentRole } from '@/services/auth/authService';
import { canEdit } from '@/lib/rbac';
import { ProjectsDashboard } from '@/components/projects/projects-dashboard';

export default async function ProjectsPage() {
  const role = await getCurrentRole();
  return <ProjectsDashboard canEdit={canEdit(role)} />;
}
