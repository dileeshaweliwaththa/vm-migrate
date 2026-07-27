'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
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
  const [jenkinsUsername, setJenkinsUsername] = useState(config.jenkinsUsername);
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

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="jk-url">Job URL</Label>
          <Input
            id="jk-url"
            value={jenkinsUrl}
            onChange={(e) => setJenkinsUrl(e.target.value)}
            placeholder="https://jenkins.example.com/job/chex-api/job/dev/"
          />
        </div>
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
        <div className="space-y-2">
          <Label htmlFor="jk-token">API token</Label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="jk-token"
              type="password"
              className="pl-9"
              autoComplete="off"
              placeholder={config.hasToken ? '•••••••••• (leave blank to keep)' : 'Paste the API token'}
              value={jenkinsApiToken}
              onChange={(e) => setJenkinsApiToken(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Stored securely server-side and never shown again — used only for syncing this
            environment.
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
