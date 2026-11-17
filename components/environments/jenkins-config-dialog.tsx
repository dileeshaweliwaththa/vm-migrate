'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Server, TriangleAlert } from 'lucide-react';
import {
  useEnvironmentJenkinsConfig,
  useSaveEnvironmentJenkinsConfig,
} from '@/hooks/environments/useEnvironmentJenkins';
import type { EnvironmentJenkinsConfig } from '@/types/common/jenkins';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Where this environment's VM gets its Jenkins server, or why it has none yet.
// A VM runs one Jenkins, so the server, its user and its token are the VM's,
// set from the VM tracker; this dialog only ever sets the environment's job.
function ServerNotice({ config }: { config: EnvironmentJenkinsConfig }) {
  const vm = config.vmJenkins?.baseUrl ? config.vmJenkins : null;
  const vmLabel = config.vmName || 'this VM';

  if (vm && vm.hasToken && vm.username) {
    return (
      <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <Server className="mr-1 inline h-3 w-3 align-[-2px]" />
        Server and credentials come from{' '}
        <span className="font-medium text-foreground">{vmLabel}</span>:{' '}
        <span className="font-mono">{vm.baseUrl}</span> as {vm.username}.
      </div>
    );
  }

  const problem = !config.vmId
    ? 'This environment has no VM, and Jenkins credentials are set on a VM.'
    : !vm
      ? `${vmLabel} has no Jenkins server set up yet.`
      : !vm.username
        ? `${vmLabel}'s Jenkins server has no user set.`
        : `${vmLabel}'s Jenkins server has no API token stored.`;

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
      <TriangleAlert className="mr-1 inline h-3 w-3 align-[-2px] text-destructive" />
      {problem} Sync and builds won&apos;t work until it is.{' '}
      {config.vmId ? (
        <Link href={`/vms/${config.vmId}`} className="font-medium text-foreground underline underline-offset-2">
          Open {vmLabel}
        </Link>
      ) : (
        <>Link a VM to this environment first.</>
      )}
    </div>
  );
}

// Inner form: seeded once from the loaded config. Only mounted after the config
// query resolves, so there's no setState-in-effect.
function ConfigForm({
  projectId,
  envId,
  config,
  onSaved,
}: {
  projectId: string;
  envId: string;
  config: EnvironmentJenkinsConfig;
  onSaved: () => void;
}) {
  const save = useSaveEnvironmentJenkinsConfig(projectId, envId);
  const [jenkinsUrl, setJenkinsUrl] = useState(config.jenkinsUrl);

  const handleSave = () => {
    save.mutate(
      { jenkinsUrl },
      {
        onSuccess: () => {
          toast.success('Jenkins job saved.');
          onSaved();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save.'),
      }
    );
  };

  return (
    <>
      <div className="space-y-4">
        <ServerNotice config={config} />
        <div className="space-y-2">
          <Label htmlFor="jk-url">Job URL</Label>
          <Input
            id="jk-url"
            value={jenkinsUrl}
            onChange={(e) => setJenkinsUrl(e.target.value)}
            placeholder={
              config.vmJenkins?.baseUrl
                ? `${config.vmJenkins.baseUrl}/job/…`
                : 'https://jenkins.example.com/job/chex-api/job/dev/'
            }
          />
          <p className="text-xs text-muted-foreground">
            Or pick one with &ldquo;Browse jobs&rdquo;, which lists every job on the VM&apos;s server.
          </p>
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" size="sm">
            Cancel
          </Button>
        </DialogClose>
        <Button type="button" size="sm" onClick={handleSave} disabled={save.isPending || !jenkinsUrl.trim()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
}

// Per-environment Jenkins settings: the environment's **job**. The server, its
// user and its token belong to the environment's VM (#84).
export function JenkinsConfigDialog({
  projectId,
  envId,
  envName,
  open,
  onOpenChange,
}: {
  projectId: string;
  envId: string;
  envName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: config, isLoading, error } = useEnvironmentJenkinsConfig(projectId, envId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Jenkins — {envName}</DialogTitle>
          <DialogDescription>
            Set this environment&apos;s Jenkins job, then use &ldquo;Sync from Jenkins&rdquo;. The server and
            its credentials are set on the VM.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : error || !config ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load Jenkins config.'}
          </p>
        ) : (
          <ConfigForm
            projectId={projectId}
            envId={envId}
            config={config}
            onSaved={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
