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
import { ProjectDialog } from '@/components/projects/project-dialog';

const ALL = 'All';

export function ProjectsDashboard({ canEdit }: { canEdit: boolean }) {
  const { data: projects, isLoading, error } = useProjects();
  const [client, setClient] = useState(ALL);
  const [search, setSearch] = useState('');

  const clients = useMemo(() => {
    const set = new Set<string>();
    (projects ?? []).forEach((p) => p.client && set.add(p.client));
    return [ALL, ...Array.from(set).sort()];
  }, [projects]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (projects ?? []).filter((p) => {
      if (client !== ALL && p.client !== client) return false;
      if (term && !`${p.name} ${p.client} ${p.description}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [projects, client, search]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            All deployments across clients. Click a project to manage its environments and docs.
          </p>
        </div>
        {canEdit ? (
          <ProjectDialog
            trigger={
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New project
              </Button>
            }
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={client} onValueChange={setClient}>
          <TabsList>
            {clients.map((c) => (
              <TabsTrigger key={c} value={c}>
                {c}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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
          No projects{client !== ALL ? ` for ${client}` : ''} yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{project.name}</CardTitle>
            {project.client ? <Badge variant="outline">{project.client}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="line-clamp-2 min-h-8 text-sm text-muted-foreground">
            {project.description || 'No description yet.'}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="uppercase">
              {project.cicdProvider}
            </Badge>
            <span>
              {project.environmentCount} environment{project.environmentCount === 1 ? '' : 's'}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
