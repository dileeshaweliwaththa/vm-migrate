'use client';

import { useState } from 'react';
import { Archive, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import type { Vm } from '@/types/common/vm';

// The tracker's archive — the VMs taken out of the grid.
//
// **Nothing here can be permanently deleted.** A VM row is the only record that
// a machine existed: its name, the addresses it answered on, what migrated onto
// it, the endpoints it served. Destroying that used to be one click on a row in
// a list, guarded by a `confirm()` — and a misread row is not a thing a confirm
// dialog catches. So the app no longer deletes VMs at all: `vms` has no delete
// policy, so not even an admin's session can (see
// `…_vms_are_never_deleted_by_a_session.sql`). Removing one for real is a
// database-level act, done where you can see what you are about to lose.
//
// What is left is Restore, at editor+. A viewer sees the contents and no actions.

interface TrashSectionProps {
  label: string;
  items: Vm[];
  onRestore: (id: string) => void;
  canWrite: boolean;
}

function TrashSection({ label, items, onRestore, canWrite }: TrashSectionProps) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 bg-muted/60 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {/* An archive box, not a bin: the icon was the loudest thing saying
              these rows were on their way to being destroyed. */}
          <Archive className="size-4 text-muted-foreground" />
          {label}
          <span className="rounded-full bg-muted-foreground/15 px-2 py-0.5 text-xs font-bold text-muted-foreground">
            {items.length}
          </span>
        </button>
        <span className="text-xs text-muted-foreground">
          Kept indefinitely — removing a VM for good is done in the database
        </span>
      </div>
      {open && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>VM Name</TableHead>
              <TableHead>Old IP</TableHead>
              <TableHead>New IP</TableHead>
              <TableHead>Archived At</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((vm) => (
              <TableRow key={vm.id}>
                <TableCell className="font-semibold">{vm.name || '(unnamed)'}</TableCell>
                <TableCell className="text-ink-source">{vm.oldIp || '—'}</TableCell>
                <TableCell className="text-ink-target">{vm.newIp || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {vm.deletedAt ? new Date(vm.deletedAt).toLocaleString() : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{vm.notes || '—'}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {canWrite ? (
                      <Button variant="outline" size="sm" onClick={() => onRestore(vm.id)}>
                        <RotateCcw className="size-3.5" /> Restore
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function VmTrash({
  deleted,
  onRestore,
  canWrite,
}: {
  deleted: Vm[];
  onRestore: (id: string) => void;
  canWrite: boolean;
}) {
  const upview = deleted.filter((v) => !v.isClient);
  const client = deleted.filter((v) => v.isClient);

  return (
    <>
      <TrashSection
        label="UPVIEW VMs — Archived"
        items={upview}
        onRestore={onRestore}
        canWrite={canWrite}
      />
      <TrashSection
        label="Client VMs — Archived"
        items={client}
        onRestore={onRestore}
        canWrite={canWrite}
      />
    </>
  );
}
