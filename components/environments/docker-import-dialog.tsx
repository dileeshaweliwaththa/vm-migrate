'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Plus, TriangleAlert } from 'lucide-react';
import { useParseDockerPs } from '@/hooks/docker/useDockerImport';
import { useEnvironmentMutations } from '@/hooks/environments/useEnvironments';
import type { DockerCandidate, DockerParseResult } from '@/types/common/docker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const PLACEHOLDER = `Paste the output of \`docker ps\` on this environment's host, e.g.

CONTAINER ID   IMAGE     ...   PORTS                     NAMES
5f85288777ee   imaui…    ...   0.0.0.0:3000->8080/tcp    imaui-web

The shell prompt and header lines are fine to include.`;

// Paste `docker ps`, review what was found, add the records you want. Mirrors the
// browse-jobs dialog: preview first, add per row, nothing written until you pick.
export function DockerImportDialog({
  projectId,
  envId,
  envName,
  portCount,
  open,
  onOpenChange,
}: {
  projectId: string;
  envId: string;
  envName: string;
  portCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<DockerParseResult | null>(null);
  // Candidates added in this session, so a row can't be added twice before the
  // project query refetches and marks it tracked.
  const [added, setAdded] = useState<Set<string>>(new Set());
  const parse = useParseDockerPs(projectId, envId);
  const { addPort } = useEnvironmentMutations(projectId);

  const handleParse = () => {
    parse.mutate(output, {
      onSuccess: (data) => {
        setResult(data);
        setAdded(new Set());
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to parse the output.'),
    });
  };

  const handleUse = (candidate: DockerCandidate, position: number) => {
    addPort.mutate(
      {
        envId,
        input: {
          port: candidate.port,
          protocol: candidate.protocol,
          description: candidate.name,
          source: 'docker',
          position,
        },
      },
      {
        onSuccess: () => {
          setAdded((prev) => new Set(prev).add(candidate.key));
          toast.success(`Added ${candidate.name} on port ${candidate.port}.`);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add the record.'),
      }
    );
  };

  const importable = (result?.candidates ?? []).filter((c) => !c.tracked && !added.has(c.key));

  const handleUseAll = () => {
    importable.forEach((c, i) => handleUse(c, portCount + i));
  };

  const reset = () => {
    setOutput('');
    setResult(null);
    setAdded(new Set());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      {/* The `sm:` prefix is required, not stylistic: dialog.tsx sets
          `sm:max-w-sm`, and an unprefixed `max-w-*` here loses to it — equal
          specificity, and Tailwind emits `sm:` variants later. Prefixed, it also
          dedupes correctly through cn()/tailwind-merge. */}
      {/* No overflow-* on the dialog itself: `overflow-y-auto` makes overflow-x
          compute to `auto` too, which gives the dialog a horizontal scrollbar and
          drags the absolutely-positioned close button out of place as it scrolls.
          Each inner region scrolls on its own instead. */}
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import from docker — {envName}</DialogTitle>
          <DialogDescription>
            Paste{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">docker ps</code>{' '}
            output from this environment&apos;s host. Published host ports become records; you
            choose which ones to add.
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: as a grid item of DialogContent this defaults to
            `min-width: auto`, so it would stretch to its widest child (the paste
            box, the table's min-w) and overflow the dialog. */}
        <div className="min-w-0 space-y-3">
          {/* The paste box is the one scrollable region: fixed size, no wrapping,
              scrolls both ways.
              - `field-sizing-fixed` overrides the primitive's
                `field-sizing-content`, which would otherwise size the control to
                its content — with wrap off that means as wide as the longest line,
                which is what blew the dialog open.
              - `wrap="off"` keeps one container per line; wrapped, a `docker ps`
                row folds into three lines and nobody can check their paste. */}
          <Textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder={PLACEHOLDER}
            className="field-sizing-fixed h-32 w-full min-w-0 overflow-auto font-mono text-xs whitespace-pre"
            wrap="off"
            spellCheck={false}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleParse} disabled={!output.trim() || parse.isPending}>
              {parse.isPending ? 'Reading…' : 'Read Containers'}
            </Button>
            {result ? (
              <Button size="sm" variant="outline" onClick={reset}>
                Clear
              </Button>
            ) : null}
            {importable.length ? (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={handleUseAll}
                disabled={addPort.isPending}
              >
                <Plus className="mr-1 h-4 w-4" /> Add All ({importable.length})
              </Button>
            ) : null}
          </div>

          {result ? (
            <div className="space-y-3">
              {result.candidates.length ? (
                <div className="max-h-80 overflow-auto rounded-md border border-border">
                  <Table className="min-w-[36rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Port</TableHead>
                        <TableHead>Container</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.candidates.map((c) => {
                        const alreadyThere = c.tracked || added.has(c.key);
                        return (
                          <TableRow key={c.key}>
                            <TableCell className="font-mono text-sm">{c.port}</TableCell>
                            <TableCell>
                              <span className="text-sm font-medium">{c.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                → {c.containerPort}/{c.protocol}
                                {c.image ? ` · ${c.image}` : ''}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.status || '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {alreadyThere ? (
                                <Badge variant="secondary" className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {c.tracked ? 'Tracked' : 'Added'}
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUse(c, portCount)}
                                  disabled={addPort.isPending}
                                >
                                  Use
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  No published ports found in that output.
                </p>
              )}

              {/* Everything the parse understood but can't import, and everything it
                  didn't understand at all — shown rather than dropped. */}
              {result.skipped.length ? (
                <details className="rounded-md border border-border px-3 py-2 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    {result.skipped.length} container(s) publish no ports — skipped
                  </summary>
                  <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                    {result.skipped.map((c) => (
                      <li key={c.containerId || c.name}>{c.name}</li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {result.unparsed.length ? (
                <details className="rounded-md border border-amber-600/40 px-3 py-2 text-sm">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-amber-700 dark:text-amber-500">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    {result.unparsed.length} line(s) couldn&apos;t be read
                  </summary>
                  <ul className="mt-2 space-y-1 font-mono text-xs break-all text-muted-foreground">
                    {result.unparsed.map((line, i) => (
                      <li key={`${i}-${line.slice(0, 12)}`}>{line}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
