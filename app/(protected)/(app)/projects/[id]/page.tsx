import { getCurrentRole } from '@/services/auth/authService';
import { canEdit, canRunBuild, isAdmin } from '@/lib/rbac';
import { ProjectDetail } from '@/components/projects/project-detail';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await getCurrentRole();

  // canBuild is separate from canEdit: viewers may run builds and read the build
  // history, but not change any configuration. See lib/rbac.ts.
  return (
    <ProjectDetail
      projectId={id}
      canEdit={canEdit(role)}
      canBuild={canRunBuild(role)}
      isAdmin={isAdmin(role)}
    />
  );
}
