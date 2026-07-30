'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Archive, FileText, Pencil, Server, Trash2 } from 'lucide-react';
import { useProject, useArchiveProject, useDeleteProject } from '@/hooks/projects/useProjects';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
import { PageHeader } from '@/components/layout/page-header';
import { ProjectDialog } from '@/components/projects/project-dialog';
import { EnvironmentsSection } from '@/components/environments/environments-section';
import { DocumentationSection } from '@/components/docs/documentation-section';

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
  const [view, setView] = useState<'environments' | 'documentation'>('environments');

  // Keyed off `projectId` rather than the loaded project, so it's usable above the
  // loading/error early-returns.
  const setArchived = (archived: boolean) =>
    archive.mutate(
      { id: projectId, archived },
      {
        onSuccess: () => toast.success(archived ? 'Archived.' : 'Restored.'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed.'),
      }
    );

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Project not found.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={project.name}
        stats={
          <>
            {project.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
            <span>
              {project.environments.length} environment{project.environments.length === 1 ? '' : 's'}
            </span>
          </>
        }
        actions={
          canEdit ? (
            <>
              <ProjectDialog
                project={project}
                trigger={
                  <Button variant="outline" size="sm">
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </Button>
                }
              />
              {/* Restore is harmless, so it stays one click. Archiving is confirmed:
                  it removes the project from everyone's list, and only an admin can
                  see or undo it — losing a project to a stray click is too easy
                  otherwise. */}
              {project.archived ? (
                <Button variant="outline" size="sm" onClick={() => setArchived(false)}>
                  <Archive className="mr-2 h-4 w-4" /> Restore
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Archive className="mr-2 h-4 w-4" /> Archive
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive “{project.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        It disappears from the Projects list. Only an admin can see archived
                        projects — via <strong>Show Archived</strong> on that page — or restore
                        it. Nothing is deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => setArchived(true)}>
                        Archive
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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
            </>
          ) : null
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Projects
        </Link>

        {project.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{project.description}</p>
        ) : null}

        <Separator />

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as 'environments' | 'documentation')}
          className="border border-border bg-muted p-1"
        >
          <ToggleGroupItem
            value="environments"
            className="px-3 data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            <Server className="mr-2 h-4 w-4" /> Environments
          </ToggleGroupItem>
          <ToggleGroupItem
            value="documentation"
            className="px-3 data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            <FileText className="mr-2 h-4 w-4" /> Documentation
          </ToggleGroupItem>
        </ToggleGroup>

        {view === 'environments' ? (
          <EnvironmentsSection project={project} canEdit={canEdit} />
        ) : (
          <DocumentationSection projectId={project.id} canEdit={canEdit} />
        )}
      </div>
    </>
  );
}
