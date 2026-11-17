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
import { cn } from '@/lib/utils';
import { PORT_SKIP_REASON_LABELS, type PortSyncPreview } from '@/types/common/jenkins';

// The preview of a Jenkins port sync (#33), with Apply / Cancel. Nothing is
// written until Apply, and Apply writes exactly what's shown here (the server
// refuses if the job's config changed in between).
//
// Removals come first and are called out: they're the lossy half of a sync,
// records the job config no longer yields. Below them, what extraction saw and
// couldn't map (#28), collapsed unless it's the whole answer.
export function JenkinsSyncDialog({
  envName,
  preview,
  applying,
  onApply,
  onClose,
}: {
  envName: string;
  preview: (PortSyncPreview & { message: string }) | null;
  applying: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const changes = preview ? preview.added.length + preview.removed.length : 0;

  return (
    <Dialog open={preview !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Sync from Jenkins · {envName}</DialogTitle>
          <DialogDescription>{preview?.message}</DialogDescription>
        </DialogHeader>
        {/* Keyed on the plan, so a new preview starts from its own defaults. */}
        {preview ? <PreviewBody key={preview.fingerprint} preview={preview} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={onApply} disabled={!changes || applying}>
            {applying
              ? 'Applying…'
              : changes
                ? `Apply: add ${preview?.added.length ?? 0}, remove ${preview?.removed.length ?? 0}`
                : 'Nothing to apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-label-caps uppercase text-muted-foreground', className)}>{children}</p>;
}

// `port/protocol` chips for the sections that only need naming, not a table.
function PortList({ items }: { items: { id: string; port: string; protocol: string }[] }) {
  return (
    <p className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.id}
          className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-label-mono text-muted-foreground"
        >
          {item.port}/{item.protocol}
        </span>
      ))}
    </p>
  );
}

function PreviewBody({ preview }: { preview: PortSyncPreview }) {
  const nothingMapped = preview.added.length + preview.unchanged.length === 0;
  const [showSkipped, setShowSkipped] = useState(nothingMapped);
  const skippedCount = preview.skipped.length;

  return (
    <div className="max-h-[60vh] space-y-5 overflow-y-auto">
      {preview.removed.length ? (
        <section className="space-y-2">
          <SectionLabel className="text-destructive">
            To remove · {preview.removed.length}
          </SectionLabel>
          <p className="text-body-sm text-muted-foreground">
            Records an earlier sync wrote that the job&apos;s config no longer yields. Apply deletes
            them.
          </p>
          <div className="overflow-x-auto rounded-lg border border-destructive/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Port</TableHead>
                  <TableHead className="w-24">Protocol</TableHead>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.removed.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-label-mono">{record.port}</TableCell>
                    <TableCell className="text-body-sm">{record.protocol}</TableCell>
                    <TableCell className="text-body-sm text-muted-foreground">
                      {record.description || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {preview.added.length ? (
        <section className="space-y-2">
          <SectionLabel>To add · {preview.added.length}</SectionLabel>
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
                {preview.added.map((port) => (
                  <TableRow key={`${port.port}/${port.protocol}`}>
                    <TableCell className="font-mono text-label-mono">{port.port}</TableCell>
                    <TableCell className="text-body-sm">{port.protocol}</TableCell>
                    <TableCell className="text-body-sm text-muted-foreground">{port.foundIn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {preview.unchanged.length ? (
        <section className="space-y-2">
          <SectionLabel>Unchanged · {preview.unchanged.length}</SectionLabel>
          <PortList items={preview.unchanged} />
        </section>
      ) : null}

      {preview.kept.length ? (
        <section className="space-y-2">
          <SectionLabel>Not touched · {preview.kept.length}</SectionLabel>
          <p className="text-body-sm text-muted-foreground">
            Records added by hand or imported from <code className="font-mono">docker ps</code>. A
            sync never changes these.
          </p>
          <PortList items={preview.kept} />
        </section>
      ) : null}

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
                    {preview.skipped.map((item) => (
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
                To keep one of these, add it as a record by hand. A sync never touches hand-added
                records.
              </p>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
