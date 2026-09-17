'use client';

import { useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { vmAddresses, type VmAddress } from '@/lib/vm-utils';
import type { Vm, VmIp, VmIpInput, VmIpMoveInput, VmIpOrigin } from '@/types/common/vm';
import { TrackerCheckbox } from './vm-fields';

// The addresses a machine answers on.
//
// `vms.new_ip` is the machine's own address and stays an ordinary field on the VM
// row. Everything here is about the **extras**: an address detached from a
// retired machine and reattached to this one, which is how a box is retired
// without touching a single DNS record. See docs/tracker.md § A VM can hold
// several addresses.
//
// Pure UI, like the rest of components/vms — every mutation arrives as a callback
// and nothing here knows an API route exists.

// The address a source VM would hand over: its **own** address. `old_ip`, not
// `new_ip` — `new_ip` is where its workload was said to be going, which is
// exactly the claim being corrected when an address moves instead.
export const sourceVmAddress = (vm: Pick<Vm, 'oldIp' | 'newIp'>): string =>
  vm.oldIp.trim() || vm.newIp.trim();

// ---- the form --------------------------------------------------------------

type Submission =
  | { kind: 'add'; input: VmIpInput }
  | { kind: 'move'; input: VmIpMoveInput }
  | { kind: 'edit'; input: VmIpInput };

// One dialog for adding an address and for editing one, because they are the same
// five fields — forking them would be two forms that drift.
//
// Adding has a mode, though, and the two modes do different amounts of work:
//
//   * **assigned** — a second address allocated to a live machine. One row.
//   * **moved** — an address taken off another machine. When that machine is in
//     the tracker this submits as a *move*, which also brings its URLs across and
//     retires it, because doing two of those three by hand is what leaves the
//     tracker describing a migration that never happened.
export function VmAddressDialog({
  trigger,
  vm,
  candidates,
  address,
  onSubmit,
}: {
  trigger: React.ReactNode;
  vm: Vm;
  // The VMs an address could be taken from — active machines other than this one.
  candidates: Vm[];
  // The address being edited, or undefined to add a new one.
  address?: VmIp;
  onSubmit: (submission: Submission) => void;
}) {
  const editing = Boolean(address);
  const [open, setOpen] = useState(false);

  const [origin, setOrigin] = useState<VmIpOrigin>('assigned');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  // '' means "the machine it came from isn't tracked here" — a perfectly ordinary
  // case (a client's retired box), and the reason `origin` exists separately from
  // `sourceVmId`.
  const [sourceVmId, setSourceVmId] = useState('');
  const [sourceVmName, setSourceVmName] = useState('');
  const [movedAt, setMovedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [moveUrls, setMoveUrls] = useState(true);
  const [trashSource, setTrashSource] = useState(true);

  // Reset on every open, so a cancelled edit never leaks into the next one and an
  // add form always starts empty.
  const reset = () => {
    setOrigin(address?.origin ?? 'assigned');
    setValue(address?.address ?? '');
    setLabel(address?.label ?? '');
    setSourceVmId('');
    setSourceVmName(address?.sourceVmName ?? '');
    setMovedAt(address?.movedAt ?? '');
    setNotes(address?.notes ?? '');
    setMoveUrls(true);
    setTrashSource(true);
  };

  // Picking the source fills in what it implies — the address it hands over and
  // its name — while leaving both editable, because the machine may have had more
  // than one and only the operator knows which moved.
  const chooseSource = (id: string) => {
    setSourceVmId(id);
    const source = candidates.find((c) => c.id === id);
    if (!source) return;
    setSourceVmName(source.name);
    setValue(sourceVmAddress(source));
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (editing) {
      onSubmit({
        kind: 'edit',
        input: { address: trimmed, label, sourceVmName, movedAt, notes },
      });
    } else if (origin === 'moved' && sourceVmId) {
      onSubmit({
        kind: 'move',
        input: { sourceVmId, address: trimmed, label, movedAt, notes, moveUrls, trashSource },
      });
    } else {
      onSubmit({
        kind: 'add',
        input: { address: trimmed, label, origin, sourceVmName, movedAt, notes },
      });
    }
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* `sm:` to actually replace the primitive's own `sm:max-w-sm` — see
          docs/ui-guidelines.md § Overriding widths on a primitive. */}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit address' : `Add an address to ${vm.name || 'this VM'}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {editing ? null : (
            <div className="space-y-2">
              <Label>Where it came from</Label>
              <ToggleGroup
                type="single"
                value={origin}
                onValueChange={(next) => next && setOrigin(next as VmIpOrigin)}
                className="gap-0.5 rounded-sm border border-border bg-muted p-0.5"
              >
                <ToggleGroupItem
                  value="assigned"
                  className="h-8 flex-1 rounded-sm px-2.5 text-xs data-[state=on]:bg-card data-[state=on]:font-medium data-[state=on]:text-foreground"
                >
                  Newly assigned
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="moved"
                  className="h-8 flex-1 rounded-sm px-2.5 text-xs data-[state=on]:bg-card data-[state=on]:font-medium data-[state=on]:text-foreground"
                >
                  Moved from another VM
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}

          {!editing && origin === 'moved' ? (
            <div className="space-y-2">
              <Label>Moved from</Label>
              <Select value={sourceVmId} onValueChange={chooseSource}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick the VM it came off…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name || '(unnamed)'} — {sourceVmAddress(c) || 'no address'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sourceVmId ? (
                <p className="text-xs text-muted-foreground">
                  Its URLs keep answering on this address — they just answer here now.
                </p>
              ) : (
                // Not every machine that hands over an address is in the tracker;
                // a name is enough to keep the history.
                <Input
                  value={sourceVmName}
                  onChange={(e) => setSourceVmName(e.target.value)}
                  placeholder="…or type a machine that isn't tracked here"
                />
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vm-ip-address">Address</Label>
              <Input
                id="vm-ip-address"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.0.0.0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vm-ip-label">Label</Label>
              <Input
                id="vm-ip-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="what it serves"
              />
            </div>
          </div>

          {editing || origin === 'moved' ? (
            <div className="space-y-2">
              <Label htmlFor="vm-ip-date">Moved on</Label>
              <Input
                id="vm-ip-date"
                type="date"
                value={movedAt}
                onChange={(e) => setMovedAt(e.target.value)}
                className="w-fit"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="vm-ip-notes">Notes</Label>
            <Input
              id="vm-ip-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="notes…"
            />
          </div>

          {!editing && origin === 'moved' && sourceVmId ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
              <label className="flex items-start gap-2 text-sm">
                <TrackerCheckbox
                  checked={moveUrls}
                  onCheckedChange={setMoveUrls}
                  label="Bring its URLs across"
                  className="mt-0.5"
                />
                <span>
                  Bring its URLs across
                  <span className="block text-xs text-muted-foreground">
                    Its own rows and its projects&rsquo; records both. They keep their DNS and
                    tested ticks — only the machine under them changes.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <TrackerCheckbox
                  checked={trashSource}
                  onCheckedChange={setTrashSource}
                  label="Send that VM to the trash"
                  className="mt-0.5"
                />
                <span>
                  Send that VM to the trash
                  <span className="block text-xs text-muted-foreground">
                    Trash, not permanent — it can be restored.
                  </span>
                </span>
              </label>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!value.trim()}>
            {editing ? 'Save' : 'Add address'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- the band --------------------------------------------------------------

// What every address chip says about itself: PRIMARY for the machine's own, and
// for an adopted one where it came from, since that provenance is the whole
// reason the row exists.
function AddressChip({
  entry,
  urlCount,
  children,
}: {
  entry: VmAddress;
  urlCount: number;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs',
        entry.primary ? 'border-border bg-card' : 'border-ink-accent/40 bg-ink-accent/5'
      )}
    >
      <span className="font-mono font-medium text-ink-target">{entry.address || '—'}</span>
      {entry.primary ? (
        <span className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
          Primary
        </span>
      ) : (
        <span
          className="text-[9px] font-bold tracking-wide text-ink-accent uppercase"
          title={entry.movedAt ? `Moved ${entry.movedAt}` : undefined}
        >
          {entry.origin === 'moved'
            ? `Moved${entry.sourceName ? ` ← ${entry.sourceName}` : ''}`
            : 'Extra'}
        </span>
      )}
      {entry.label ? <span className="text-muted-foreground">{entry.label}</span> : null}
      <span className="text-[10px] text-muted-foreground">
        {urlCount} URL{urlCount === 1 ? '' : 's'}
      </span>
      {children}
    </span>
  );
}

// The set of chips, plus the editor's controls. Shared by both views — the grid
// wraps it in a band row, the card drops it straight into the body, and neither
// works out what an address is for itself.
export function VmAddressList({
  vm,
  candidates,
  h,
  canWrite,
}: {
  vm: Vm;
  candidates: Vm[];
  h: VmAddressHandlers;
  canWrite: boolean;
}) {
  const entries = vmAddresses(vm);
  const countFor = (entry: VmAddress) =>
    vm.urls.filter((u) => (u.ipId ?? null) === entry.id).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        Addresses
      </span>
      {entries.map((entry) => {
        // Only the extras get controls: the primary address is the VM's own New
        // IP field, edited in the row above like every other field. A null `id`
        // *is* "this is the primary", so the lookup and the buttons stand or fall
        // together.
        const ip = entry.id ? vm.ips.find((row) => row.id === entry.id) : undefined;
        return (
          <AddressChip key={entry.id ?? 'primary'} entry={entry} urlCount={countFor(entry)}>
            {canWrite && ip ? (
              <>
                <VmAddressDialog
                  vm={vm}
                  candidates={candidates}
                  address={ip}
                  onSubmit={(submission) => {
                    if (submission.kind === 'edit') h.onUpdateIp(vm.id, ip.id, submission.input);
                  }}
                  trigger={
                    <button
                      type="button"
                      title="Edit this address"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-3" />
                    </button>
                  }
                />
                <button
                  type="button"
                  onClick={() => h.onDeleteIp(vm.id, ip.id)}
                  title="Remove this address — its URLs fall back to the primary"
                  className="text-destructive hover:opacity-70"
                >
                  <X className="size-3" />
                </button>
              </>
            ) : null}
          </AddressChip>
        );
      })}
      {canWrite ? (
        <VmAddressDialog
          vm={vm}
          candidates={candidates}
          onSubmit={(submission) => {
            if (submission.kind === 'add') h.onAddIp(vm.id, submission.input);
            if (submission.kind === 'move') h.onMoveIp(vm.id, submission.input);
          }}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-sm border border-dashed border-primary/50 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <Plus className="size-3" /> Add IP
            </button>
          }
        />
      ) : null}
    </div>
  );
}

// The slice of `VmHandlers` this file needs. Declared here so the band can be
// dropped anywhere without dragging the whole tracker contract behind it.
export interface VmAddressHandlers {
  onAddIp: (vmId: string, input: VmIpInput) => void;
  onMoveIp: (vmId: string, input: VmIpMoveInput) => void;
  onUpdateIp: (vmId: string, ipId: string, input: VmIpInput) => void;
  onDeleteIp: (vmId: string, ipId: string) => void;
}

// The grid's version: a full-width band under the VM row, the same shape the
// group headers and the "Migrated from" rows use. A band rather than a column
// because the table is 1800px of fixed columns and a sixteenth would have to be
// threaded through every `colSpan` in the tracker.
export function VmAddressBand({
  vm,
  candidates,
  h,
  canWrite,
  columns,
}: {
  vm: Vm;
  candidates: Vm[];
  h: VmAddressHandlers;
  canWrite: boolean;
  columns: number;
}) {
  // A viewer looking at an ordinary single-address machine gets nothing at all —
  // there is no second address to disambiguate, and the band would be a label
  // over one value they can already see in the row above.
  if (!canWrite && vm.ips.length === 0) return null;

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="w-16 bg-primary/60" />
      <TableCell colSpan={columns - 1} className="bg-muted/30 py-1.5 pl-5">
        <VmAddressList vm={vm} candidates={candidates} h={h} canWrite={canWrite} />
      </TableCell>
    </TableRow>
  );
}

// ---- per-endpoint picker ---------------------------------------------------

// Which address a single URL answers on. Rendered **only** on a machine that has
// more than one, so a single-address VM's rows look exactly as they always have:
// the address as plain text, no control to ignore.
export function UrlAddressPicker({
  vm,
  ipId,
  onChange,
  canWrite,
  className,
}: {
  vm: Vm;
  ipId: string | null;
  onChange: (next: string | null) => void;
  canWrite: boolean;
  className?: string;
}) {
  const entries = vmAddresses(vm);
  const current = entries.find((e) => e.id === (ipId ?? null)) ?? entries[0];

  if (entries.length < 2 || !canWrite) {
    return (
      <span className={cn('text-xs text-ink-target', className)}>{current?.address}</span>
    );
  }

  // `PRIMARY` as the sentinel because Radix's Select treats '' as "no value" and
  // would render the placeholder instead of the machine's own address.
  return (
    <Select
      value={ipId ?? 'PRIMARY'}
      onValueChange={(next) => onChange(next === 'PRIMARY' ? null : next)}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          'w-full rounded-none border-0 bg-transparent px-1 text-xs shadow-none dark:bg-transparent',
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {entries.map((entry) => (
          <SelectItem key={entry.id ?? 'primary'} value={entry.id ?? 'PRIMARY'}>
            {entry.address || '—'}
            {entry.primary ? '' : ` · ${entry.sourceName || entry.label || 'extra'}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
