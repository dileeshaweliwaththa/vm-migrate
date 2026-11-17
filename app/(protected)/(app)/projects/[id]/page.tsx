import { notFound } from 'next/navigation';
import { getCurrentRole } from '@/services/auth/authService';
import { projectExists } from '@/services/projects/projectService';
import { canEdit, canRunBuild, isAdmin } from '@/lib/rbac';
import { ProjectDetail } from '@/components/projects/project-detail';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [role, exists] = await Promise.all([getCurrentRole(), projectExists(id)]);

  // A stale or mistyped link renders the in-shell 404
  // (`(app)/not-found.tsx`), not a page that loads and then shows an error.
  if (!exists) notFound();

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
