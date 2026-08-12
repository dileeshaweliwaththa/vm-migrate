'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import {
  CICD_PROVIDERS,
  ENVIRONMENT_NAMES,
  type CicdProvider,
  type Environment,
  type EnvironmentInput,
  type EnvironmentName,
} from '@/types/common/project';
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

  const [name, setName] = useState<EnvironmentName>(environment?.name ?? 'DEV');
  const [cicdProvider, setCicdProvider] = useState<CicdProvider>(environment?.cicdProvider ?? 'jenkins');
  const [deployUrl, setDeployUrl] = useState(environment?.deployUrl ?? '');
  const [notes, setNotes] = useState(environment?.notes ?? '');
  const [vm, setVm] = useState<VmSelection>(
    environment?.vmId ? { mode: 'existing', vmId: environment.vmId } : { mode: 'none' }
  );

  const pending = addEnvironment.isPending || updateEnvironment.isPending;

  const handleSave = () => {
    const input: EnvironmentInput = { name, cicdProvider, deployUrl, notes };
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
          <DialogTitle>{environment ? 'Edit Environment' : 'Add Environment'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={name} onValueChange={(v) => setName(v as EnvironmentName)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENT_NAMES.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          {/* No Jenkins job URL here. The URL, username and token are one unit of
              configuration, and the token can only be set in the Jenkins settings
              modal (it never travels through this form) — a second box for one
              third of it just gave the same field two owners. See
              docs/jenkins-sync.md. */}
          {cicdProvider === 'jenkins' ? (
            <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Settings2 className="mr-1 inline h-3 w-3 align-[-2px]" />
              Set the Jenkins server, job and credentials in{' '}
              <span className="font-medium text-foreground">Jenkins settings</span> on the
              environment card{environment ? '' : ', once this environment exists'}.
            </p>
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
          <Button size="sm" onClick={handleSave} disabled={!name || pending}>
            {pending ? 'Saving…' : environment ? 'Save Changes' : 'Add Environment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
