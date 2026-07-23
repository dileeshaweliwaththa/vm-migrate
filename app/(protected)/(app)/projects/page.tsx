import { getCurrentRole } from '@/services/auth/authService';
import { ProjectsDashboard } from '@/components/projects/projects-dashboard';

export default async function ProjectsPage() {
  const role = await getCurrentRole();
  const canEdit = role === 'editor' || role === 'admin';
  return <ProjectsDashboard canEdit={canEdit} />;
}
