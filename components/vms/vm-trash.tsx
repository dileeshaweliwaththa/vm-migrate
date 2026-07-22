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
}

function TrashSection({ type, label, items, onRestore, onPurge, onClearTrash }: TrashSectionProps) {
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
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {items.length}
          </span>
        </button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onClearTrash(type)}
          className="text-red-600 hover:text-red-700"
        >
          Clear all
        </Button>
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
                <TableCell className="text-amber-600 dark:text-amber-400">
                  {vm.oldIp || '—'}
                </TableCell>
                <TableCell className="text-emerald-600 dark:text-emerald-400">
                  {vm.newIp || '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {vm.deletedAt ? new Date(vm.deletedAt).toLocaleString() : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{vm.notes || '—'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => onRestore(vm.id)}>
                      <RotateCcw className="size-3.5" /> Restore
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPurge(vm.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="size-3.5" /> Delete
                    </Button>
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
}: {
  deleted: Vm[];
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onClearTrash: (type: TrashType) => void;
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
      />
      <TrashSection
        type="client"
        label="Client VMs — Deleted"
        items={client}
        onRestore={onRestore}
        onPurge={onPurge}
        onClearTrash={onClearTrash}
      />
    </>
  );
}
