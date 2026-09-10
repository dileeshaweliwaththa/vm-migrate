'use client';

import { useState } from 'react';
import { FolderPlus, Layers, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { VmGroup } from '@/types/common/vm';

// The grouping UI: the bar that acts on a selection, the headers the grid and the
// cards render their groups under, and the name form both create and rename use.
//
// Pure UI — every mutation arrives as a callback prop, exactly like the rest of
// the tracker's components (see docs/architecture.md). Nothing here knows an API
// route exists.

// The name form, as a dialog. One component for both jobs: creating a group and
// renaming one are the same single field, and forking them would be two dialogs
// that drift.
export function VmGroupDialog({
  trigger,
  title,
  initialName = '',
  confirmLabel,
  pending = false,
  onSubmit,
}: {
  trigger: React.ReactNode;
  title: string;
  initialName?: string;
  confirmLabel: string;
  pending?: boolean;
  onSubmit: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset on every open so a cancelled rename doesn't persist into the
        // next one, and a create form always starts empty.
        if (next) setName(initialName);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="vm-group-name">Group name</Label>
          <Input
            id="vm-group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            // Enter is the obvious way to submit a one-field form, and the
            // dialog has no <form> to do it for us.
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="EUKHOST"
            autoFocus
          />
          <p className="text-body-sm text-muted-foreground">
            Usually the client or provider whose machines these are.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// What to do with the VMs currently ticked. Rendered only when something is
// selected, so it never takes space it hasn't earned.
export function VmSelectionBar({
  selectedCount,
  groups,
  pending,
  onAssign,
  onCreateGroup,
  onClear,
}: {
  selectedCount: number;
  groups: VmGroup[];
  pending: boolean;
  onAssign: (groupId: string | null) => void;
  onCreateGroup: (name: string) => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    // Floating, centred at the bottom of the viewport. The selection is built by
    // scrolling a very long grid, so the actions have to stay reachable from
    // wherever the last tick was made — and floating avoids pinning it under the
    // sticky page header, whose height isn't a fixed number this could offset by.
    // `shadow-level-2` is the design system's elevation for surfaces that sit
    // *over* content (dropdowns, popovers); cards get none.
    <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-level-2">
      <span className="font-mono text-label-mono text-foreground">
        {selectedCount} VM{selectedCount === 1 ? '' : 's'} selected
      </span>

      {/* `modal={false}`: the "New group…" item is a DialogTrigger, so the menu
          stays open behind the dialog (its `onSelect` is prevented below). A
          modal menu keeps a focus trap while open and would fight the dialog for
          focus, leaving the name field unfocusable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            <Layers className="size-4" /> Group
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Add to group</DropdownMenuLabel>
          {groups.length === 0 ? (
            <DropdownMenuItem disabled>No groups yet</DropdownMenuItem>
          ) : (
            groups.map((group) => (
              <DropdownMenuItem key={group.id} onSelect={() => onAssign(group.id)}>
                {group.name}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          {/* The dialog's trigger sits inside a menu item, so the item must not
              close the menu before the dialog mounts — `onSelect` is prevented
              and the trigger handles the click. */}
          <VmGroupDialog
            title="New group"
            confirmLabel="Create & add"
            pending={pending}
            onSubmit={onCreateGroup}
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <FolderPlus className="size-4" /> New group…
              </DropdownMenuItem>
            }
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onAssign(null)}>Remove from group</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" variant="ghost" onClick={onClear} disabled={pending}>
        <X className="size-4" /> Clear
      </Button>
    </div>
  );
}

// The group's own controls — rename, delete, and select-every-VM-in-it — shared
// by the grid's header row and the cards' heading so the two can't offer
// different actions.
function GroupActions({
  group,
  memberCount,
  pending,
  onRename,
  onDelete,
  onSelectAll,
}: {
  group: VmGroup;
  memberCount: number;
  pending: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSelectAll: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={onSelectAll} disabled={pending}>
        Select all
      </Button>
      <VmGroupDialog
        title={`Rename “${group.name}”`}
        initialName={group.name}
        confirmLabel="Save"
        pending={pending}
        onSubmit={onRename}
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label={`Rename ${group.name}`} title="Rename">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${group.name}`}
            title="Delete group"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{group.name}”?</AlertDialogTitle>
            {/* Worth stating plainly: this is the one destructive-looking button
                in the tracker that destroys nothing but a label. */}
            <AlertDialogDescription>
              The group is removed and its {memberCount} VM{memberCount === 1 ? '' : 's'} become
              ungrouped. No VM, URL or migration data is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete group</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// The grid's group divider: one full-width band above the group's rows. A band
// rather than an indent — the table is 1800px wide and scrolls sideways, and an
// indent would be off-screen exactly when you need to know which group you're
// looking at.
export function VmGroupHeaderRow({
  group,
  memberCount,
  columnCount,
  canWrite,
  pending,
  onRename,
  onDelete,
  onSelectAll,
}: {
  group: VmGroup | null;
  memberCount: number;
  columnCount: number;
  canWrite: boolean;
  pending: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSelectAll: () => void;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={columnCount} className="bg-muted/70 py-1.5">
        <div className="sticky left-0 flex w-fit items-center gap-2 pl-2">
          <Layers className="size-3.5 text-muted-foreground" />
          <span className="text-label-caps uppercase">{group ? group.name : 'Ungrouped'}</span>
          <span className="font-mono text-label-mono text-muted-foreground">{memberCount}</span>
          {group && canWrite ? (
            <GroupActions
              group={group}
              memberCount={memberCount}
              pending={pending}
              onRename={onRename}
              onDelete={onDelete}
              onSelectAll={onSelectAll}
            />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

// The card view's equivalent: the same name, count and actions above the group's
// cards.
export function VmGroupHeading({
  group,
  memberCount,
  canWrite,
  pending,
  onRename,
  onDelete,
  onSelectAll,
}: {
  group: VmGroup | null;
  memberCount: number;
  canWrite: boolean;
  pending: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSelectAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/70 px-3 py-1.5">
      <Layers className="size-3.5 text-muted-foreground" />
      <span className="text-label-caps uppercase">{group ? group.name : 'Ungrouped'}</span>
      <span className="font-mono text-label-mono text-muted-foreground">{memberCount}</span>
      {group && canWrite ? (
        <GroupActions
          group={group}
          memberCount={memberCount}
          pending={pending}
          onRename={onRename}
          onDelete={onDelete}
          onSelectAll={onSelectAll}
        />
      ) : null}
    </div>
  );
}
