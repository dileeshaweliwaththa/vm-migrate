'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Activity, CheckCircle2, KeyRound, MinusCircle, Unplug } from 'lucide-react';
import { useGithubStatus, useSaveGithubToken, useTestGithub } from '@/hooks/github/useGithub';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

// The app's GitHub connection. Its own section with its own buttons, not part of
// the page's Save: a token is verified against GitHub when it's saved, and a
// failure there shouldn't hold the Gemini settings hostage (or vice versa).
//
// The token is write-only — this section is only ever told whether one is set and
// which account it belongs to.
export function GithubSettings() {
  const { data: status, isLoading, error } = useGithubStatus();
  const save = useSaveGithubToken();
  const test = useTestGithub();
  const [token, setToken] = useState('');

  const connect = () =>
    save.mutate(token, {
      onSuccess: (s) => {
        toast.success(`Connected to GitHub as ${s.login}.`);
        setToken('');
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save the token.'),
    });

  const disconnect = () =>
    save.mutate('', {
      onSuccess: () => toast.success('GitHub disconnected.'),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to disconnect.'),
    });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">GitHub</h2>
        <p className="text-sm text-muted-foreground">
          Lets editors pick a record’s repository and branch from a list instead of typing them.
          Use a fine-grained token with <span className="font-medium text-foreground">Metadata: read-only</span>{' '}
          on the organisation that owns the repositories. Stored server-side and never shown again.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load the GitHub connection.'}
        </p>
      ) : (
        <>
          <div className="flex items-start gap-2 text-sm">
            {status?.configured ? (
              <>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  Connected as <span className="font-medium">{status.login}</span>
                  {status.verifiedAt ? (
                    <span className="text-muted-foreground">
                      {' '}
                      · verified {new Date(status.verifiedAt).toLocaleString()}
                    </span>
                  ) : null}
                </p>
              </>
            ) : (
              <>
                <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">Not connected — records take a repository typed by hand.</p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="github-token">Access token</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="github-token"
                  type="password"
                  className="pl-9"
                  autoComplete="off"
                  placeholder={status?.configured ? '•••••••••• (paste a new one to replace)' : 'github_pat_…'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && token.trim() && connect()}
                />
              </div>
              <Button size="sm" className="h-9" onClick={connect} disabled={!token.trim() || save.isPending}>
                {save.isPending ? 'Verifying…' : status?.configured ? 'Replace' : 'Connect'}
              </Button>
            </div>
          </div>

          {status?.configured ? (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Connection</p>
                  <p className="text-xs text-muted-foreground">
                    Check the token still works and how many repositories it can see.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
                    <Activity className="mr-2 h-4 w-4" />
                    {test.isPending ? 'Checking…' : 'Test'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={disconnect} disabled={save.isPending}>
                    <Unplug className="mr-2 h-4 w-4" /> Disconnect
                  </Button>
                </div>
              </div>
              {test.data ? (
                <p className="text-sm">
                  Connected as <span className="font-medium">{test.data.login}</span> —{' '}
                  {test.data.repoCount} repositories visible.
                  {test.data.repoCount === 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      None visible usually means the token’s resource owner is your personal account
                      rather than the organisation, or the organisation hasn’t approved it yet.
                    </span>
                  ) : null}
                </p>
              ) : test.error ? (
                <p className="text-sm text-destructive">
                  {test.error instanceof Error ? test.error.message : 'GitHub check failed.'}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
