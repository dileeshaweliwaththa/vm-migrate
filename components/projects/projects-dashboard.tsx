'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useProjects } from '@/hooks/projects/useProjects';
import type { Project } from '@/types/common/project';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/page-header';
import { ProjectDialog } from '@/components/projects/project-dialog';

const ALL = 'All';

export function ProjectsDashboard({ canEdit }: { canEdit: boolean }) {
  const { data: projects, isLoading, error } = useProjects();
  const [tag, setTag] = useState(ALL);
  const [search, setSearch] = useState('');

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

  return (
    <>
      <PageHeader
        title="Projects"
        stats={
          <>
            <span>
              Projects: <b className="text-foreground">{projects?.length ?? 0}</b>
            </span>
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
          No projects{tag !== ALL ? ` tagged ${tag}` : ''} yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
        )}
      </div>
    </>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{project.name}</CardTitle>
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
