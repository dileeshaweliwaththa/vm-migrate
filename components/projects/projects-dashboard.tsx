'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Plus, Search } from 'lucide-react';
import { useArchiveProject, useProjects } from '@/hooks/projects/useProjects';
import type { Project } from '@/types/common/project';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/page-header';
import { ProjectDialog } from '@/components/projects/project-dialog';

const ALL = 'All';

export function ProjectsDashboard({
  canEdit,
  isAdmin,
}: {
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [tag, setTag] = useState(ALL);
  const [search, setSearch] = useState('');
  // Admins only. Passed to the hook as a request; the service re-checks the role.
  const [showArchived, setShowArchived] = useState(false);
  const { data: projects, isLoading, error } = useProjects(isAdmin && showArchived);

  const tags = useMemo(() => {
    const set = new Set<string>();
    (projects ?? []).forEach((p) => p.tags.forEach((t) => set.add(t)));
    return [ALL, ...Array.from(set).sort()];
  }, [projects]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (projects ?? []).filter((p) => {
      if (tag !== ALL && !p.tags.includes(tag)) return false;
      if (term && !`${p.name} ${p.tags.join(' ')} ${p.description}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [projects, tag, search]);

  const tagCount = Math.max(0, tags.length - 1);
  const archivedCount = (projects ?? []).filter((p) => p.archived).length;
  const activeCount = (projects ?? []).length - archivedCount;

  return (
    <>
      <PageHeader
        title="Projects"
        stats={
          <>
            <span>
              Projects: <b className="text-foreground">{activeCount}</b>
            </span>
            {archivedCount ? (
              <span>
                Archived: <b className="text-foreground">{archivedCount}</b>
              </span>
            ) : null}
            <span>
              Tags: <b className="text-foreground">{tagCount}</b>
            </span>
          </>
        }
        actions={
          canEdit ? (
            <ProjectDialog
              trigger={
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> New Project
                </Button>
              }
            />
          ) : null
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
        {tags.length > 1 ? (
          <Tabs value={tag} onValueChange={setTag}>
            <TabsList>
              {tags.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-4">
          {/* Admin-only: archived projects are invisible to editors and viewers,
              and the service enforces that regardless of what the UI sends.

              Toggle, not Switch. `ui/switch.tsx` styles on `data-checked` /
              `data-unchecked`, which are Radix 2.x boolean attributes — this project
              is on radix-ui 1.4.3, which emits `data-state="checked"`. So the track
              never gets a background and the switch renders invisible. Toggle uses
              `data-[state=on]` + `aria-pressed`, both of which 1.4.3 does emit, and
              its sizing isn't conditional on a data variant. See ui-guidelines.md. */}
          {isAdmin ? (
            <Toggle
              variant="outline"
              size="sm"
              pressed={showArchived}
              onPressedChange={setShowArchived}
              aria-label="Show archived projects"
              className="shrink-0"
            >
              <Archive className="mr-1.5 h-4 w-4" /> Show Archived
            </Toggle>
          ) : null}
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load projects.'}
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No {showArchived ? '' : 'active '}projects{tag !== ALL ? ` tagged ${tag}` : ''} yet.
          {isAdmin && !showArchived ? (
            <span className="mt-1 block">Turn on “Show Archived” if you archived one.</span>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} canRestore={isAdmin} />
          ))}
        </div>
        )}
      </div>
    </>
  );
}

function ProjectCard({ project, canRestore }: { project: Project; canRestore: boolean }) {
  const archive = useArchiveProject();

  // The card is a Link, so the restore button has to stop the click from
  // navigating before it fires.
  const handleRestore = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    archive.mutate(
      { id: project.id, archived: false },
      {
        onSuccess: () => toast.success(`Restored “${project.name}”.`),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to restore.'),
      }
    );
  };

  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card
        className={`h-full transition-colors hover:border-primary/50 ${
          project.archived ? 'border-dashed bg-muted/30' : ''
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{project.name}</CardTitle>
            {project.archived ? (
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="secondary">Archived</Badge>
                {canRestore ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Restore ${project.name}`}
                    title="Restore"
                    onClick={handleRestore}
                    disabled={archive.isPending}
                  >
                    <ArchiveRestore className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {project.tags.length ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {project.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="line-clamp-2 min-h-8 text-sm text-muted-foreground">
            {project.description || 'No description yet.'}
          </p>
          <div className="text-xs text-muted-foreground">
            {project.environmentCount} environment{project.environmentCount === 1 ? '' : 's'}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
