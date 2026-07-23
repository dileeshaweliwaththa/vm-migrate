'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ExternalLink, Pencil, Plus, Server, Trash2 } from 'lucide-react';
import { PROTOCOLS, type Protocol } from '@/types/common/vm';
import type { Environment, ProjectDetail } from '@/types/common/project';
import { useEnvironmentMutations } from '@/hooks/environments/useEnvironments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { EnvironmentForm } from '@/components/environments/environment-form';

export function EnvironmentsSection({
  project,
  canEdit,
}: {
  project: ProjectDetail;
  canEdit: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Environments</h2>
        {canEdit ? (
          <EnvironmentForm
            projectId={project.id}
            trigger={
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> Add Environment
              </Button>
            }
          />
        ) : null}
      </div>

      {project.environments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No environments yet.
        </div>
      ) : (
        <div className="space-y-4">
          {project.environments.map((env) => (
            <EnvironmentCard key={env.id} projectId={project.id} env={env} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}

function EnvironmentCard({
  projectId,
  env,
  canEdit,
}: {
  projectId: string;
  env: Environment;
  canEdit: boolean;
}) {
  const { removeEnvironment, addPort, removePort } = useEnvironmentMutations(projectId);
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState<Protocol>('HTTPS');
  const [description, setDescription] = useState('');

  const handleAddPort = () => {
    if (!port.trim()) return;
    addPort.mutate(
      { envId: env.id, input: { port, protocol, description, position: env.ports.length } },
      {
        onSuccess: () => {
          setPort('');
          setDescription('');
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add port.'),
      }
    );
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{env.name || 'unnamed'}</span>
          <Badge variant="secondary" className="uppercase">
            {env.cicdProvider}
          </Badge>
          {env.vmName ? (
            <Link
              href="/tracker"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Server className="h-3 w-3" /> {env.vmName}
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {env.jenkinsUrl ? (
            <a
              href={env.jenkinsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Jenkins <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {env.deployUrl ? (
            <a
              href={env.deployUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Live <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {canEdit ? (
            <>
              <EnvironmentForm
                projectId={projectId}
                environment={env}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label="Edit environment">
                    <Pencil className="h-4 w-4" />
                  </Button>
                }
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete environment">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{env.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the environment and its ports. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        removeEnvironment.mutate(env.id, {
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : 'Failed to remove.'),
                        })
                      }
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Port</TableHead>
              <TableHead className="w-28">Protocol</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24">Source</TableHead>
              {canEdit ? <TableHead className="w-12" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {env.ports.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono">{p.port}</TableCell>
                <TableCell>{p.protocol}</TableCell>
                <TableCell className="text-muted-foreground">{p.description || '—'}</TableCell>
                <TableCell>
                  <Badge variant={p.source === 'jenkins' ? 'secondary' : 'outline'}>{p.source}</Badge>
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete port"
                      onClick={() =>
                        removePort.mutate(
                          { envId: env.id, portId: p.id },
                          { onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed.') }
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {env.ports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 5 : 4} className="text-center text-sm text-muted-foreground">
                  No ports recorded.
                </TableCell>
              </TableRow>
            ) : null}
            {canEdit ? (
              <TableRow>
                <TableCell>
                  <Input
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="3000"
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <Select value={protocol} onValueChange={(v) => setProtocol(v as Protocol)}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOLS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="API"
                    className="h-8"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPort()}
                  />
                </TableCell>
                <TableCell colSpan={2}>
                  <Button size="sm" variant="outline" onClick={handleAddPort} disabled={!port.trim()}>
                    Add
                  </Button>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
