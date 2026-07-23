'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CICD_PROVIDERS, type CicdProvider, type Environment, type EnvironmentInput } from '@/types/common/project';
import { useEnvironmentMutations } from '@/hooks/environments/useEnvironments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
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
import { VmField, type VmSelection } from '@/components/environments/vm-field';

// Add or edit an environment. Pass `environment` to edit; omit to add.
export function EnvironmentForm({
  projectId,
  environment,
  trigger,
}: {
  projectId: string;
  environment?: Environment;
  trigger: React.ReactNode;
}) {
  const { addEnvironment, updateEnvironment } = useEnvironmentMutations(projectId);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(environment?.name ?? '');
  const [cicdProvider, setCicdProvider] = useState<CicdProvider>(environment?.cicdProvider ?? 'jenkins');
  const [jenkinsUrl, setJenkinsUrl] = useState(environment?.jenkinsUrl ?? '');
  const [deployUrl, setDeployUrl] = useState(environment?.deployUrl ?? '');
  const [notes, setNotes] = useState(environment?.notes ?? '');
  const [vm, setVm] = useState<VmSelection>(
    environment?.vmId ? { mode: 'existing', vmId: environment.vmId } : { mode: 'none' }
  );

  const pending = addEnvironment.isPending || updateEnvironment.isPending;

  const handleSave = () => {
    const input: EnvironmentInput = { name, cicdProvider, jenkinsUrl, deployUrl, notes };
    if (vm.mode === 'existing') input.vmId = vm.vmId || null;
    else if (vm.mode === 'none') input.vmId = null;
    else input.newVm = vm.newVm;

    const done = (message: string) => {
      toast.success(message);
      setOpen(false);
    };
    const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong.');

    if (environment) {
      updateEnvironment.mutate(
        { envId: environment.id, input },
        { onSuccess: () => done('Environment updated.'), onError: fail }
      );
    } else {
      addEnvironment.mutate(input, { onSuccess: () => done('Environment added.'), onError: fail });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{environment ? 'Edit environment' : 'Add environment'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="e-name">Name</Label>
              <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="production" />
            </div>
            <div className="space-y-2">
              <Label>CI/CD</Label>
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
          {cicdProvider === 'jenkins' ? (
            <div className="space-y-2">
              <Label htmlFor="e-jenkins">Jenkins job URL</Label>
              <Input id="e-jenkins" value={jenkinsUrl} onChange={(e) => setJenkinsUrl(e.target.value)} placeholder="https://jenkins…/job/chex-api" />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="e-deploy">Deployed URL</Label>
            <Input id="e-deploy" value={deployUrl} onChange={(e) => setDeployUrl(e.target.value)} placeholder="https://api.example.com" />
          </div>
          <VmField value={vm} onChange={setVm} />
          <div className="space-y-2">
            <Label htmlFor="e-notes">Notes</Label>
            <Textarea id="e-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!name || pending}>
            {pending ? 'Saving…' : environment ? 'Save changes' : 'Add environment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
