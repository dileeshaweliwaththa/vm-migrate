'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, ExternalLink, GitBranch, Lock } from 'lucide-react';
import type { Environment, EnvironmentPort } from '@/types/common/project';
import type { GithubRepo } from '@/types/common/github';
import { useJenkinsRecordSource } from '@/hooks/environments/useEnvironmentJenkins';
import { useEnvironmentMutations } from '@/hooks/environments/useEnvironments';
import { useGithubBranches, useGithubRepos } from '@/hooks/github/useGithub';
import { githubFullName, repoLabel, repoWebUrl } from '@/lib/repo';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

// A record's source — the repository and branch it's built from — behind one
// icon on its row. **One way to show it, two ways to fill it in:**
//
// - A record linked to a Jenkins job reads both live from the job's config.xml
//   when the popover opens. Nothing to type, and nothing stored to go stale.
// - Every other record (manual, docker, any managed platform) has them chosen
//   here by an editor and stored on the record — picked from GitHub when the app
//   has a GitHub token (Settings → GitHub), typed by hand when it doesn't.
export function RecordSource({
  projectId,
  env,
  port,
  canEdit,
}: {
  projectId: string;
  env: Environment;
  port: EnvironmentPort;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Same test the card uses to decide a row has a job behind it: a URL left on a
  // record after the provider was switched away isn't read.
  const fromJenkins = env.cicdProvider === 'jenkins' && Boolean(port.jenkinsJobUrl);
  const stored = [port.repoUrl ? repoLabel(port.repoUrl) : '', port.branch].filter(Boolean).join(' · ');
  const known = fromJenkins || Boolean(stored);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Repository and branch"
          // The stored source is known without opening anything, so it's in the
          // tooltip; a Jenkins record's is only known once Jenkins is asked.
          title={stored || (fromJenkins ? 'Repository and branch (from Jenkins)' : 'Set the repository and branch')}
          className="shrink-0"
        >
          <GitBranch className={`h-3.5 w-3.5 ${known ? 'text-ink-accent' : 'text-muted-foreground'}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 text-body-sm">
        <div>
          <p className="font-medium">Source</p>
          <p className="text-xs text-muted-foreground">
            {fromJenkins ? 'Read from the Jenkins job config.' : 'Set on this record.'}
          </p>
        </div>
        {fromJenkins ? (
          <JenkinsSource projectId={projectId} envId={env.id} portId={port.id} enabled={open} />
        ) : canEdit ? (
          <SourceForm projectId={projectId} envId={env.id} port={port} onSaved={() => setOpen(false)} />
        ) : (
          <SourceRows repoUrl={port.repoUrl} branch={port.branch} />
        )}
      </PopoverContent>
    </Popover>
  );
}

// The read-only view — shared by both paths, so a Jenkins record and a stored one
// read the same way.
function SourceRows({
  repoUrl,
  branch,
  branchNote,
  scriptPath,
  emptyText = 'Not set',
}: {
  repoUrl: string;
  branch: string;
  branchNote?: string;
  scriptPath?: string;
  emptyText?: string;
}) {
  const href = repoWebUrl(repoUrl);
  return (
    <dl className="space-y-2">
      <div>
        <dt className="text-label-caps font-bold uppercase text-muted-foreground">Repository</dt>
        <dd className="break-all">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              title={`Open ${href}`}
              className="inline-flex items-center gap-1 font-mono text-label-mono text-ink-accent hover:underline"
            >
              {repoLabel(repoUrl)}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : repoUrl ? (
            <span className="font-mono text-label-mono">{repoLabel(repoUrl)}</span>
          ) : (
            <span className="text-muted-foreground">{emptyText}</span>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-label-caps font-bold uppercase text-muted-foreground">Branch</dt>
        <dd>
          {branch ? (
            <span className="font-mono text-label-mono">{branch}</span>
          ) : (
            <span className="text-muted-foreground">{emptyText}</span>
          )}
          {branchNote ? <span className="block text-xs text-muted-foreground">{branchNote}</span> : null}
        </dd>
      </div>
      {scriptPath ? (
        <div>
          <dt className="text-label-caps font-bold uppercase text-muted-foreground">Jenkinsfile</dt>
          <dd className="font-mono text-label-mono">{scriptPath}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function JenkinsSource({
  projectId,
  envId,
  portId,
  enabled,
}: {
  projectId: string;
  envId: string;
  portId: string;
  enabled: boolean;
}) {
  const { data, error, isLoading } = useJenkinsRecordSource(projectId, envId, portId, enabled);

  if (isLoading) return <p className="text-muted-foreground">Reading the job config…</p>;
  if (error) return <p className="text-destructive">{error.message}</p>;
  if (!data) return null;

  return (
    <SourceRows
      repoUrl={data.repoUrl}
      branch={data.branch}
      scriptPath={data.scriptPath}
      emptyText="Not found in the job config"
      branchNote={
        data.branchParameter
          ? `Default of the ${data.branchParameter} build parameter — a build can pick another.`
          : undefined
      }
    />
  );
}

// A searchable dropdown — the one shape both pickers take. Rendered from inside
// the source popover, so Radix stacks it as a nested layer: picking an item closes
// this list, not the popover around it.
function Picker({
  id,
  value,
  placeholder,
  searchPlaceholder,
  emptyText,
  items,
  onSelect,
}: {
  id: string;
  value: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  items: { value: string; label: string; hint?: React.ReactNode }[];
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between font-mono text-label-mono font-normal"
        >
          <span className="truncate">{value || <span className="text-muted-foreground">{placeholder}</span>}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', item.label === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate font-mono text-label-mono">{item.label}</span>
                  {item.hint}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SourceForm({
  projectId,
  envId,
  port,
  onSaved,
}: {
  projectId: string;
  envId: string;
  port: EnvironmentPort;
  onSaved: () => void;
}) {
  const { updatePort } = useEnvironmentMutations(projectId);
  const [repoUrl, setRepoUrl] = useState(port.repoUrl);
  const [branch, setBranch] = useState(port.branch);
  // Typing instead of picking: forced when GitHub isn't connected or can't be
  // reached, and available on request for a repository the token can't see.
  const [manual, setManual] = useState(false);

  const repos = useGithubRepos(true);
  const connected = Boolean(repos.data?.configured) && !repos.error;
  const picking = connected && !manual;

  const fullName = githubFullName(repoUrl);
  const branches = useGithubBranches(fullName, picking);
  const href = repoWebUrl(repoUrl);

  const repoByName = new Map((repos.data?.repos ?? []).map((r) => [r.fullName, r]));

  const pickRepo = (repo: GithubRepo) => {
    setRepoUrl(repo.url);
    // A branch belongs to its repository — switching repositories starts from the
    // new one's default rather than keeping a name that may not exist there.
    if (repo.fullName !== fullName) setBranch(repo.defaultBranch);
  };

  const save = () => {
    updatePort.mutate(
      { envId, portId: port.id, input: { repoUrl, branch } },
      {
        onSuccess: () => {
          toast.success('Source saved.');
          onSaved();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save.'),
      }
    );
  };

  const repoNote = repos.isLoading
    ? 'Loading repositories from GitHub…'
    : repos.error
      ? `${repos.error.message} Type it instead.`
      : !repos.data?.configured
        ? 'An admin can connect GitHub in Settings to pick from a list.'
        : null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`repo-${port.id}`}>Repository</Label>
          {connected ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => setManual((m) => !m)}
            >
              {manual ? 'Pick from GitHub' : 'Type instead'}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          {picking ? (
            <Picker
              id={`repo-${port.id}`}
              value={fullName ?? (repoUrl ? repoLabel(repoUrl) : '')}
              placeholder="Select a repository…"
              searchPlaceholder="Search repositories…"
              emptyText="No repositories found."
              items={(repos.data?.repos ?? []).map((r) => ({
                value: r.fullName,
                label: r.fullName,
                hint: r.private ? <Lock className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" /> : null,
              }))}
              onSelect={(name) => {
                const repo = repoByName.get(name);
                if (repo) pickRepo(repo);
              }}
            />
          ) : (
            <Input
              id={`repo-${port.id}`}
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="https://github.com/org/repo"
              className="h-8"
            />
          )}
          {href ? (
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={href} target="_blank" rel="noreferrer" aria-label="Open repository" title={`Open ${href}`}>
                <ExternalLink className="h-3.5 w-3.5 text-ink-accent" />
              </a>
            </Button>
          ) : null}
        </div>
        {repoNote ? <p className="text-xs text-muted-foreground">{repoNote}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`branch-${port.id}`}>Branch</Label>
        {/* A branch list needs a GitHub repository to list it for; anything
            else (no repository yet, a GitLab URL) is typed. */}
        {picking && fullName && !branches.error ? (
          <Picker
            id={`branch-${port.id}`}
            value={branch}
            placeholder={branches.isLoading ? 'Loading branches…' : 'Select a branch…'}
            searchPlaceholder="Search branches…"
            emptyText="No branches found."
            items={(branches.data?.branches ?? []).map((b) => ({ value: b, label: b }))}
            onSelect={setBranch}
          />
        ) : (
          <Input
            id={`branch-${port.id}`}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="main"
            className="h-8 font-mono text-label-mono md:text-label-mono"
          />
        )}
        {branches.error ? <p className="text-xs text-muted-foreground">{branches.error.message}</p> : null}
        {picking && !fullName ? (
          <p className="text-xs text-muted-foreground">Pick a repository to list its branches.</p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={updatePort.isPending}>
          {updatePort.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
