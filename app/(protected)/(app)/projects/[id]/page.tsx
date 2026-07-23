import { getCurrentRole } from '@/services/auth/authService';
import { ProjectDetail } from '@/components/projects/project-detail';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await getCurrentRole();
  const canEdit = role === 'editor' || role === 'admin';
  const isAdmin = role === 'admin';

  return <ProjectDetail projectId={id} canEdit={canEdit} isAdmin={isAdmin} />;
}
