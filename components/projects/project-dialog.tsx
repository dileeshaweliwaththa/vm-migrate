'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CICD_PROVIDERS, type CicdProvider, type Project } from '@/types/common/project';
import { useCreateProject, useUpdateProject } from '@/hooks/projects/useProjects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Create or edit a project. Pass `project` to edit; omit to create.
export function ProjectDialog({
  project,
  trigger,
}: {
  project?: Project;
  trigger: React.ReactNode;
}) {
  const create = useCreateProject();
  const update = useUpdateProject();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(project?.name ?? '');
  const [client, setClient] = useState(project?.client ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [repoUrl, setRepoUrl] = useState(project?.repoUrl ?? '');
  const [cicdProvider, setCicdProvider] = useState<CicdProvider>(project?.cicdProvider ?? 'none');

  const pending = create.isPending || update.isPending;

  const handleSave = () => {
    const input = { name, client, description, repoUrl, cicdProvider };
    const done = (message: string) => {
      toast.success(message);
      setOpen(false);
    };
    const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong.');

    if (project) {
      update.mutate({ id: project.id, input }, { onSuccess: () => done('Project updated.'), onError: fail });
    } else {
      create.mutate(input, {
        onSuccess: () => {
          done('Project created.');
          setName('');
          setClient('');
          setDescription('');
          setRepoUrl('');
          setCicdProvider('none');
        },
        onError: fail,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>
            {project ? 'Update this project’s details.' : 'Add a project to the deployment dashboard.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="chex-api" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-client">Client / group</Label>
              <Input id="p-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="CHEX" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="p-repo">Repository URL</Label>
              <Input id="p-repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/…" />
            </div>
            <div className="space-y-2">
              <Label>Default CI/CD</Label>
              <Select value={cicdProvider} onValueChange={(v) => setCicdProvider(v as CicdProvider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CICD_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p} className="uppercase">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!name || pending}>
            {pending ? 'Saving…' : project ? 'Save changes' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
