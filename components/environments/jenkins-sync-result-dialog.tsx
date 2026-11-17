'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PORT_SKIP_REASON_LABELS,
  type EnvironmentSyncResult,
} from '@/types/common/jenkins';

// What a Jenkins sync wrote, and what it saw in the job config and couldn't map
// (#28). Shown whenever anything was skipped: a toast saying "Synced 2 ports"
// reads as "covered everything", which is exactly the case it can't promise.
//
// The skipped list is collapsible and starts open only when nothing was written,
// because then it's the whole answer.
export function JenkinsSyncResultDialog({
  envName,
  result,
  onClose,
}: {
  envName: string;
  result: (EnvironmentSyncResult & { message: string }) | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={result !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Jenkins sync · {envName}</DialogTitle>
          <DialogDescription>{result?.message}</DialogDescription>
        </DialogHeader>
        {/* Keyed on the result, so a second sync starts from its own default. */}
        {result ? <SyncResultBody key={JSON.stringify(result)} result={result} /> : null}
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SyncResultBody({ result }: { result: EnvironmentSyncResult }) {
  const [showSkipped, setShowSkipped] = useState(result.written === 0);
  const skippedCount = result.skipped.length;

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <p className="text-label-caps uppercase text-muted-foreground">
          Written · {result.written}
        </p>
        {result.ports.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Port</TableHead>
                  <TableHead className="w-24">Protocol</TableHead>
                  <TableHead>Found by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.ports.map((port) => (
                  <TableRow key={port.port}>
                    <TableCell className="font-mono text-label-mono">{port.port}</TableCell>
                    <TableCell className="text-body-sm">{port.protocol}</TableCell>
                    <TableCell className="text-body-sm text-muted-foreground">{port.foundIn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-body-sm text-muted-foreground">No ports were written.</p>
        )}
      </section>

      {skippedCount ? (
        <section className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            aria-expanded={showSkipped}
            onClick={() => setShowSkipped((open) => !open)}
          >
            {showSkipped ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {skippedCount} item{skippedCount === 1 ? '' : 's'} couldn&apos;t be mapped
          </Button>
          {showSkipped ? (
            <>
              <div className="max-h-[40vh] overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Value</TableHead>
                      <TableHead className="w-56">Why</TableHead>
                      <TableHead>Where in the job</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.skipped.map((item) => (
                      <TableRow key={`${item.reason}:${item.token}`} className="align-top">
                        <TableCell className="font-mono text-label-mono">{item.token}</TableCell>
                        <TableCell className="whitespace-normal text-body-sm">
                          {PORT_SKIP_REASON_LABELS[item.reason]}
                          <span className="block text-muted-foreground">{item.foundIn}</span>
                        </TableCell>
                        <TableCell className="whitespace-normal break-all font-mono text-label-mono text-muted-foreground">
                          {item.context}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-body-sm text-muted-foreground">
                To keep one of these, add it as a record by hand. A sync only replaces the records it
                wrote itself, so manual ones stay.
              </p>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
