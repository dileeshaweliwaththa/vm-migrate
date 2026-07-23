'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Project } from '@/types/common/project';
import { useCreateProject, useUpdateProject } from '@/hooks/projects/useProjects';
import { useTags } from '@/hooks/tags/useTags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagPicker } from '@/components/projects/tag-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

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
  const { data: availableTags } = useTags();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(project?.name ?? '');
  const [tags, setTags] = useState<string[]>(project?.tags ?? []);
  const [description, setDescription] = useState(project?.description ?? '');

  const pending = create.isPending || update.isPending;

  const handleSave = () => {
    const input = { name, description, tags };
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
          setTags([]);
          setDescription('');
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
          <DialogTitle>{project ? 'Edit Project' : 'New Project'}</DialogTitle>
          <DialogDescription>
            {project ? 'Update this project’s details.' : 'Add a project to the deployment dashboard.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CHEXCALIBUR" />
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <TagPicker value={tags} available={availableTags ?? []} onChange={setTags} />
            <p className="text-xs text-muted-foreground">
              Tap a tag to select it, or + to add a new one. Used to group and filter projects.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={handleSave} disabled={!name || pending}>
            {pending ? 'Saving…' : project ? 'Save Changes' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
