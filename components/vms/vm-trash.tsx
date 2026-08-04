'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Trash2, X } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import type { Vm, TrashType } from '@/types/common/vm';

interface TrashSectionProps {
  type: TrashType;
  label: string;
  items: Vm[];
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onClearTrash: (type: TrashType) => void;
  // Editor+ may restore; only an admin may permanently delete. A viewer sees the
  // trash contents and no actions at all.
  canWrite: boolean;
  canPurge: boolean;
}

function TrashSection({
  type,
  label,
  items,
  onRestore,
  onPurge,
  onClearTrash,
  canWrite,
  canPurge,
}: TrashSectionProps) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between bg-muted/60 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <Trash2 className="size-4 text-muted-foreground" />
          {label}
          <span className="rounded-full bg-tone-danger px-2 py-0.5 text-xs font-bold text-tone-danger-fg">
            {items.length}
          </span>
        </button>
        {canPurge ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onClearTrash(type)}
            className="text-destructive hover:text-destructive/80"
          >
            Clear all
          </Button>
        ) : null}
      </div>
      {open && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>VM Name</TableHead>
              <TableHead>Old IP</TableHead>
              <TableHead>New IP</TableHead>
              <TableHead>Deleted At</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((vm) => (
              <TableRow key={vm.id}>
                <TableCell className="font-semibold">{vm.name || '(unnamed)'}</TableCell>
                <TableCell className="text-ink-source">
                  {vm.oldIp || '—'}
                </TableCell>
                <TableCell className="text-ink-target">
                  {vm.newIp || '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {vm.deletedAt ? new Date(vm.deletedAt).toLocaleString() : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{vm.notes || '—'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {canWrite ? (
                      <Button variant="outline" size="sm" onClick={() => onRestore(vm.id)}>
                        <RotateCcw className="size-3.5" /> Restore
                      </Button>
                    ) : null}
                    {canPurge ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPurge(vm.id)}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <X className="size-3.5" /> Delete
                      </Button>
                    ) : null}
                    {!canWrite && !canPurge ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : null}
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
  onPurge,
  onClearTrash,
  canWrite,
  canPurge,
}: {
  deleted: Vm[];
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onClearTrash: (type: TrashType) => void;
  canWrite: boolean;
  canPurge: boolean;
}) {
  const upview = deleted.filter((v) => !v.isClient);
  const client = deleted.filter((v) => v.isClient);

  return (
    <>
      <TrashSection
        type="upview"
        label="UPVIEW VMs — Deleted"
        items={upview}
        onRestore={onRestore}
        onPurge={onPurge}
        onClearTrash={onClearTrash}
        canWrite={canWrite}
        canPurge={canPurge}
      />
      <TrashSection
        type="client"
        label="Client VMs — Deleted"
        items={client}
        onRestore={onRestore}
        onPurge={onPurge}
        onClearTrash={onClearTrash}
        canWrite={canWrite}
        canPurge={canPurge}
      />
    </>
  );
}
