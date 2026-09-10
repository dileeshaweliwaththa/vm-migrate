'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Server } from 'lucide-react';
import {
  useEnvironmentJenkinsConfig,
  useSaveEnvironmentJenkinsConfig,
} from '@/hooks/environments/useEnvironmentJenkins';
import type { EnvironmentJenkinsConfig, EnvironmentJenkinsInput } from '@/types/common/jenkins';
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

const SECRET_UNCHANGED = '';

// The VM's Jenkins server root, when there's one to borrow. Named rather than
// inlined because "" and undefined both have to fall through to the placeholder.
const inheritedBase = (config: EnvironmentJenkinsConfig): string =>
  config.inherited?.jenkinsBase ?? '';

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
  // Seeded from what the VM already has where this environment has nothing. The
  // server root is a starting point, not an answer: the editor still has to name
  // the job (or save and pick one with "Browse jobs", which only needs the root).
  const [jenkinsUrl, setJenkinsUrl] = useState(config.jenkinsUrl || inheritedBase(config));
  const [jenkinsUsername, setJenkinsUsername] = useState(
    config.jenkinsUsername || config.inherited?.jenkinsUsername || ''
  );
  const [jenkinsApiToken, setJenkinsApiToken] = useState(SECRET_UNCHANGED);

  const handleSave = () => {
    const input: EnvironmentJenkinsInput = { jenkinsUrl, jenkinsUsername };
    if (jenkinsApiToken !== SECRET_UNCHANGED) input.jenkinsApiToken = jenkinsApiToken;
    save.mutate(input, {
      onSuccess: () => {
        toast.success('Jenkins settings saved.');
        onSaved();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save.'),
    });
  };

  // The token is never sent to the browser, so "prefilled" can only ever mean the
  // two non-secret fields — the third is a promise the server keeps on save.
  const inherited = config.inherited;

  // A VM runs one Jenkins, and it is configured on the VM (tracker → the J
  // button). So when this environment's machine has a server, this form is about
  // the **job** only: showing username and token here as well would be a second
  // place to maintain one set of credentials, which is exactly what moving them
  // to the VM was for. Without a configured VM — an environment with no VM
  // linked, or one whose VM hasn't been set up — the old per-environment fields
  // remain, or there would be nowhere to put them.
  const vmJenkins = config.vmJenkins?.baseUrl ? config.vmJenkins : null;

  return (
    <>
      <div className="space-y-4">
        {vmJenkins ? (
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Server className="mr-1 inline h-3 w-3 align-[-2px]" />
            Server and credentials come from{' '}
            <span className="font-medium text-foreground">{vmJenkins.vmName || 'this VM'}</span> —{' '}
            <span className="font-mono">{vmJenkins.baseUrl}</span>
            {vmJenkins.hasToken ? (
              <> as {vmJenkins.username || 'its configured user'}. Set the job below.</>
            ) : (
              <>
                , but <span className="font-medium text-foreground">no API token is stored</span>{' '}
                for it yet — add one on the VM in the tracker.
              </>
            )}
          </div>
        ) : null}
        {inherited && !vmJenkins ? (
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Server className="mr-1 inline h-3 w-3 align-[-2px]" />
            {inherited.vmName ? (
              <>
                <span className="font-medium text-foreground">{inherited.vmName}</span> already has
                Jenkins set up
              </>
            ) : (
              <>This VM already has Jenkins set up</>
            )}
            , so its server and user are filled in below and its API token will be reused. Paste a
            token only to use a different one.
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="jk-url">Job URL</Label>
          <Input
            id="jk-url"
            value={jenkinsUrl}
            onChange={(e) => setJenkinsUrl(e.target.value)}
            placeholder="https://jenkins.example.com/job/chex-api/job/dev/"
          />
        </div>
        {vmJenkins ? null : (
        <div className="space-y-2">
          <Label htmlFor="jk-user">Username</Label>
          <Input
            id="jk-user"
            autoComplete="off"
            value={jenkinsUsername}
            onChange={(e) => setJenkinsUsername(e.target.value)}
            placeholder="jenkins user"
          />
        </div>
        )}
        {vmJenkins ? null : (
        <div className="space-y-2">
          <Label htmlFor="jk-token">API token</Label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="jk-token"
              type="password"
              className="pl-9"
              autoComplete="off"
              placeholder={
                config.hasToken
                  ? '•••••••••• (leave blank to keep)'
                  : inherited
                    ? '•••••••••• (leave blank to reuse the VM’s)'
                    : 'Paste the API token'
              }
              value={jenkinsApiToken}
              onChange={(e) => setJenkinsApiToken(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Stored securely server-side and never shown again — used only for syncing this
            environment.
          </p>
        </div>
        )}
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

// Per-environment Jenkins settings modal. Credentials live with the environment
// (URL/username on the row; token in the server-only secrets store).
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
            Set this environment&apos;s Jenkins job and credentials, then use “Sync from Jenkins”.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
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
