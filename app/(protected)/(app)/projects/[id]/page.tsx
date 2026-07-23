import { getCurrentRole } from '@/services/auth/authService';
import { canEdit, isAdmin } from '@/lib/rbac';
import { ProjectDetail } from '@/components/projects/project-detail';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await getCurrentRole();

  return <ProjectDetail projectId={id} canEdit={canEdit(role)} isAdmin={isAdmin(role)} />;
}
