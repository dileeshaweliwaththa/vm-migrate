'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Archive, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useProject, useArchiveProject, useDeleteProject } from '@/hooks/projects/useProjects';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ProjectDialog } from '@/components/projects/project-dialog';
import { EnvironmentsSection } from '@/components/environments/environments-section';

export function ProjectDetail({
  projectId,
  canEdit,
  isAdmin,
}: {
  projectId: string;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const { data: project, isLoading, error } = useProject(projectId);
  const archive = useArchiveProject();
  const remove = useDeleteProject();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Project not found.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            {project.client ? <Badge variant="outline">{project.client}</Badge> : null}
            <Badge variant="secondary" className="uppercase">
              {project.cicdProvider}
            </Badge>
          </div>
          {project.description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{project.description}</p>
          ) : null}
          {project.repoUrl ? (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Repository <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>

        {canEdit ? (
          <div className="flex items-center gap-2">
            <ProjectDialog
              project={project}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
              }
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                archive.mutate(
                  { id: project.id, archived: !project.archived },
                  {
                    onSuccess: () => toast.success(project.archived ? 'Restored.' : 'Archived.'),
                    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed.'),
                  }
                )
              }
            >
              <Archive className="mr-2 h-4 w-4" /> {project.archived ? 'Restore' : 'Archive'}
            </Button>
            {isAdmin ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the project, its environments, and ports. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        remove.mutate(project.id, {
                          onSuccess: () => {
                            toast.success('Project deleted.');
                            router.push('/projects');
                          },
                          onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed.'),
                        })
                      }
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        ) : null}
      </div>

      <Separator />

      <EnvironmentsSection project={project} canEdit={canEdit} />
    </div>
  );
}
