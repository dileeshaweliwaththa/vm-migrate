'use client';

import * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, KeyRound, PlugZap, ServerCog, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  useSaveVmJenkinsConfig,
  useTestVmJenkins,
  useVmJenkinsConfig,
} from '@/hooks/vms/useVmJenkins';
import type { VmJenkinsConfig } from '@/types/common/jenkins';
import type { Vm } from '@/types/common/vm';

// A VM's Jenkins server, set from the tracker.
//
// A VM runs one Jenkins, so this is where the server, its Basic-auth user and
// its API token live — the environments on this machine only name their own
// jobs. Before this, each environment carried its own copy of all three and a
// sibling had to lend them.
//
// The token is write-only by construction: the payload behind the trigger says
// whether one is stored (`hasToken`), never what it is, and an empty field on
// save means "keep the stored one".

// What the trigger looks like, which is also the tracker's "Jenkins lives here"
// marker: filled once the server is set, outlined when it isn't.
//
// **It has to forward the props it is given.** `DialogTrigger asChild` clones its
// child through a Slot and hands it the `onClick`, the `ref` and the `data-state`
// that open the dialog. A component that renders a button but drops its incoming
// props swallows all of that: the button paints correctly and clicking it does
// absolutely nothing, with no error to go on. So everything unrecognised is
// spread onto the real element, and `className` is merged rather than replaced.
function JenkinsTrigger({
  jenkins,
  vmName,
  className,
  ...props
}: {
  jenkins: VmJenkinsConfig | null;
  vmName: string;
} & React.ComponentProps<'button'>) {
  const configured = Boolean(jenkins?.baseUrl);
  const ready = configured && Boolean(jenkins?.hasToken);

  return (
    <button
      type="button"
      title={
        configured
          ? `Jenkins: ${jenkins?.baseUrl}${ready ? '' : ' — no API token stored yet'}`
          : `Set up Jenkins for ${vmName || 'this VM'}`
      }
      aria-label={`Jenkins server for ${vmName || 'this VM'}`}
      {...props}
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-xs font-bold transition-colors',
        // Three states, and the middle one matters: a server with no token is
        // configured but can't be used, so it reads as neither on nor off.
        ready
          ? 'border-transparent bg-accent-step text-white'
          : configured
            ? 'border-accent-step text-accent-step'
            : 'border-steel-400 bg-transparent text-steel-600 dark:text-steel-300',
        className
      )}
    >
      <ServerCog className="size-3.5" />J
    </button>
  );
}

// Inner form: seeded once from the config it is mounted with, so there is no
// setState-in-an-effect (the same shape as `jenkins-config-dialog.tsx`). The
// caller remounts it — via `key` — when a fresh read comes back with different
// values.
function JenkinsForm({
  vm,
  config,
  pending,
  testing,
  result,
  onSave,
  onTest,
  onCancel,
}: {
  vm: Vm;
  config: VmJenkinsConfig | null;
  pending: boolean;
  testing: boolean;
  // The outcome of the last check, whether it was asked for or ran itself after
  // a save. Null before anything has been tried.
  result: { ok: boolean; message: string } | null;
  onSave: (input: { baseUrl: string; username: string; apiToken: string }) => void;
  onTest: (input: { baseUrl: string; username: string; apiToken: string }) => void;
  onCancel: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? '');
  const [username, setUsername] = useState(config?.username ?? '');
  // Always blank: the token is never sent to the browser, so an empty field is
  // the only honest starting state — and on save it means "keep the stored one".
  const [apiToken, setApiToken] = useState('');

  return (
    <>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vm-jenkins-url">Server address</Label>
            <Input
              id="vm-jenkins-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={vm.newIp || vm.oldIp || '20.197.41.68'}
              autoFocus
            />
            {/* 8080 is Jenkins' default and what these servers run on, so the
                address is normally just the machine's IP. Typing a port or a
                scheme still works and is kept. */}
            <p className="text-body-sm text-muted-foreground">
              Just the host is enough — <code className="font-mono">:8080</code> and{' '}
              <code className="font-mono">http://</code> are filled in. Add a port only if this
              server uses a different one.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vm-jenkins-user">Username</Label>
            <Input
              id="vm-jenkins-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="jenkins-user"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="vm-jenkins-token">API token</Label>
              {config?.hasToken ? (
                <Badge variant="outline" className="rounded-sm text-label-caps uppercase">
                  <KeyRound className="size-3" /> Stored
                </Badge>
              ) : null}
            </div>
            <Input
              id="vm-jenkins-token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={config?.hasToken ? 'Leave blank to keep the stored token' : ''}
              autoComplete="off"
            />
            <p className="text-body-sm text-muted-foreground">
              Stored server-side only and never sent back to the browser. Jenkins → your user →
              Configure → API token.
            </p>
          </div>
        </div>

        {/* Whether it actually works, in the same place you configured it. Tone
            plus an icon plus the sentence — never colour alone
            (docs/ui-guidelines.md § Status tones). */}
        {result ? (
          <div
            className={cn(
              'flex items-start gap-2 rounded-md px-3 py-2 text-body-sm',
              result.ok
                ? 'bg-tone-success text-tone-success-fg'
                : 'bg-tone-danger text-tone-danger-fg'
            )}
          >
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{result.message}</span>
          </div>
        ) : null}

        <DialogFooter className="sm:justify-between">
          {/* Testing is separate from saving so a server can be checked before
              it is committed — and re-checked later without retyping the token,
              which the browser never receives. */}
          <Button
            variant="outline"
            onClick={() => onTest({ baseUrl, username, apiToken })}
            disabled={testing || pending || !baseUrl.trim()}
          >
            <PlugZap className="size-4" />
            {testing ? 'Testing…' : 'Test connection'}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={() => onSave({ baseUrl, username, apiToken })} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
    </>
  );
}

export function VmJenkinsDialog({ vm, canWrite }: { vm: Vm; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  // Re-read on open rather than trusting the grid's copy: the token flag and the
  // username may have changed in another tab, and this is the form that writes
  // them.
  const { data: loaded, isLoading } = useVmJenkinsConfig(vm.id, open);
  const save = useSaveVmJenkinsConfig();
  const test = useTestVmJenkins();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const config = loaded ?? vm.jenkins ?? null;

  const runTest = (input?: { baseUrl: string; username: string; apiToken: string }) =>
    test.mutate(
      { vmId: vm.id, input },
      {
        onSuccess: setResult,
        // A rejected *request* (403, network) is different from a failed test,
        // and this is the only path that can produce one.
        onError: (error) =>
          setResult({
            ok: false,
            message: error instanceof Error ? error.message : 'Could not run the test.',
          }),
      }
    );

  const handleSave = (input: { baseUrl: string; username: string; apiToken: string }) => {
    save.mutate(
      { vmId: vm.id, input },
      {
        onSuccess: (saved) => {
          toast.success(
            saved.baseUrl ? `Jenkins set to ${saved.baseUrl}.` : 'Jenkins configuration cleared.'
          );
          // Save then check, with the dialog left open on the result: "did that
          // work?" is the next question every time, and answering it here beats
          // finding out from a failed sync on some environment later. Nothing to
          // check if the configuration was just cleared.
          if (saved.baseUrl) runTest();
          else setOpen(false);
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : 'Failed to save.'),
      }
    );
  };

  const trigger = <JenkinsTrigger jenkins={config} vmName={vm.name} />;

  // A viewer sees the marker — which machines run Jenkins is not a secret — but
  // gets no form. The service re-checks the role regardless.
  if (!canWrite) return trigger;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Last run's verdict belongs to last run — reopening shouldn't show a
        // stale "connected" next to values that have since changed elsewhere.
        if (!next) setResult(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Jenkins on {vm.name || 'this VM'}</DialogTitle>
          <DialogDescription>
            One Jenkins per machine. Every environment deployed on this VM uses this server and
            these credentials — they only add their own job.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-center text-body-sm text-muted-foreground">Loading…</p>
        ) : (
          <JenkinsForm
            // Remount when a fresh read changes what the fields should start
            // from — the alternative is writing state from an effect.
            key={`${config?.baseUrl ?? ''}|${config?.username ?? ''}|${config?.hasToken ?? false}`}
            vm={vm}
            config={config}
            pending={save.isPending}
            testing={test.isPending}
            result={result}
            onSave={handleSave}
            onTest={runTest}
            onCancel={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
