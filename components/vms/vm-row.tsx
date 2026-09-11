'use client';

import { Fragment } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { buildFullUrl, migratedSources } from '@/lib/vm-utils';
import type { Vm } from '@/types/common/vm';
import { VmJenkinsDialog } from './vm-jenkins-dialog';
import {
  CellInput,
  StatusPill,
  UrlOwnerBadge,
  VmSelectCheckbox,
  type VmHandlers,
} from './vm-fields';
import { YesNoToggle } from './yes-no-toggle';

// 15 columns. There is no Protocol column: it was a per-row dropdown on a value
// that is HTTPS for effectively every endpoint, and the projects records table
// never had one either. `proto` is still on the row — it is what builds the Full
// New URL — it just isn't a cell you have to look at or fill in.
export const TRACKER_COLUMNS = 15;

// Read-only rows shown under a "primary" destination VM for every source VM
// (active, trashed, or archived) that migrated its URLs onto this IP. Which
// sources those are is `migratedSources` in lib/vm-utils — shared with the card
// view, which renders the same set without the per-URL detail.
function MigratedFrom({ vm, allVms, allDeleted }: { vm: Vm; allVms: Vm[]; allDeleted: Vm[] }) {
  const sources = migratedSources(vm, allVms, allDeleted);
  if (sources.length === 0) return null;

  return (
    <>
      {sources.map(({ tag, ...src }) => (
        <Fragment key={`mig-${vm.id}-${src.id}`}>
          <TableRow className="hover:bg-transparent">
            <TableCell className="w-16 bg-steel-700" />
            <TableCell colSpan={TRACKER_COLUMNS - 1} className="bg-steel-800 py-1.5 text-steel-100">
              <span className="text-[10px] font-bold tracking-wide text-steel-400 uppercase">
                ⬆ Migrated from:{' '}
              </span>
              <span className="text-xs font-semibold text-steel-50">{src.name || '(unnamed)'}</span>
              <span className="ml-2 text-[10px] text-steel-300">
                {src.oldIp} → {src.newIp}
              </span>
              {tag ? (
                <span
                  className={cn(
                    'ml-2 rounded-sm px-2 py-0.5 text-[9px] font-bold text-steel-900',
                    tag === 'ARCHIVED' ? 'bg-steel-400' : 'bg-steel-50'
                  )}
                >
                  {tag}
                </span>
              ) : null}
            </TableCell>
          </TableRow>
          {src.urls.map((u) => (
            <TableRow key={`mig-url-${vm.id}-${src.id}-${u.id}`} className="hover:bg-transparent">
              <TableCell className="w-16 bg-steel-700" />
              <TableCell className="bg-steel-800 py-1 pl-5">
                <span className="rounded-sm bg-steel-400 px-2 py-0.5 text-[9px] font-bold tracking-wide text-steel-900">
                  MIGRATED
                </span>
              </TableCell>
              <TableCell className="bg-steel-800 text-xs text-steel-400">{src.oldIp}</TableCell>
              <TableCell className="bg-steel-800 text-xs text-steel-100">{src.newIp}</TableCell>
              <TableCell className="bg-steel-800 text-center text-xs font-semibold text-steel-100">
                {u.port}
              </TableCell>
              <TableCell className="bg-steel-800 text-xs text-steel-300">{u.url}</TableCell>
              <TableCell className="bg-steel-800 text-xs font-medium text-steel-100">
                {buildFullUrl(u.proto, src.newIp, u.port)}
              </TableCell>
              <TableCell className="bg-steel-800 text-center text-xs text-steel-200">
                {u.dns ? 'Yes' : 'No'}
              </TableCell>
              <TableCell className="bg-steel-800 text-center text-xs text-steel-200">
                {u.tested ? 'Yes' : 'No'}
              </TableCell>
              <TableCell className="bg-steel-800" colSpan={4} />
              <TableCell className="bg-steel-800 text-xs text-steel-400">{u.notes}</TableCell>
              <TableCell className="bg-steel-800" />
            </TableRow>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export function VmRow({
  vm,
  allVms,
  allDeleted,
  h,
  canWrite,
  selected = false,
}: {
  vm: Vm;
  allVms: Vm[];
  allDeleted: Vm[];
  h: VmHandlers;
  // Editor+ — false for a viewer, who sees the grid but no editing controls.
  // Expand/collapse stays available either way: it is local view state, not data.
  canWrite: boolean;
  // Ticked for grouping. Editor-only: a viewer has nothing to do with a
  // selection, so the column stays empty for them rather than offering a
  // control whose every action is hidden.
  selected?: boolean;
}) {
  const readOnly = !canWrite;

  return (
    <>
      {/* VM row */}
      <TableRow className="border-b-2 border-b-primary/40 bg-muted/40 hover:bg-muted/60">
        {/* The tick shares the chevron's cell instead of claiming a column of
            its own: `TRACKER_COLUMNS` and every `colSpan` in this file are keyed
            to the 15-column grid, and a 16th would have to be threaded through
            the migrated-from bands and the add-URL row as well. Two controls,
            one 4rem gutter. */}
        <TableCell className="w-16 p-0">
          <div className="flex items-center justify-center gap-1">
            {canWrite ? (
              <VmSelectCheckbox
                checked={selected}
                onCheckedChange={() => h.onToggleSelect(vm.id)}
                label={`Select ${vm.name || 'this VM'}`}
              />
            ) : null}
            <button
              type="button"
              onClick={() => h.onToggleExpand(vm)}
              className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-expanded={vm.expanded}
              title={vm.expanded ? 'Collapse' : 'Expand'}
            >
              {vm.expanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          </div>
        </TableCell>
        <TableCell className="py-1">
          <CellInput
            value={vm.name}
            placeholder="vm-name"
            onChange={(v) => h.onVmLocalChange(vm.id, { name: v })}
            onCommit={(v) => h.onVmCommit(vm.id, { name: v })}
            className="font-semibold"
            readOnly={readOnly}
          />
        </TableCell>
        <TableCell className="py-1">
          <CellInput
            value={vm.oldIp}
            placeholder="0.0.0.0"
            onChange={(v) => h.onVmLocalChange(vm.id, { oldIp: v })}
            onCommit={(v) => h.onVmCommit(vm.id, { oldIp: v })}
            className="text-ink-source"
            readOnly={readOnly}
          />
        </TableCell>
        <TableCell className="py-1">
          <CellInput
            value={vm.newIp}
            placeholder="0.0.0.0"
            onChange={(v) => h.onVmLocalChange(vm.id, { newIp: v })}
            onCommit={(v) => h.onVmCommit(vm.id, { newIp: v })}
            className="text-ink-target"
            readOnly={readOnly}
          />
        </TableCell>
        <TableCell className="text-center text-xs text-muted-foreground">
          {vm.urls.length} URL{vm.urls.length !== 1 ? 's' : ''}
        </TableCell>
        <TableCell colSpan={4} />
        <TableCell className="text-center">
          <YesNoToggle
            value={vm.migrated}
            onChange={(v) => h.onVmCommit(vm.id, { migrated: v })}
            readOnly={readOnly}
          />
        </TableCell>
        <TableCell className="text-center">
          <YesNoToggle
            value={vm.isSupabase}
            onChange={(v) => h.onVmCommit(vm.id, { isSupabase: v })}
            readOnly={readOnly}
          />
        </TableCell>
        <TableCell className="text-center">
          <YesNoToggle
            value={vm.keep}
            onChange={(v) => h.onVmCommit(vm.id, { keep: v })}
            readOnly={readOnly}
          />
        </TableCell>
        <TableCell className="text-center">
          <StatusPill vm={vm} />
        </TableCell>
        <TableCell className="py-1">
          <CellInput
            value={vm.notes}
            placeholder="notes..."
            onChange={(v) => h.onVmLocalChange(vm.id, { notes: v })}
            onCommit={(v) => h.onVmCommit(vm.id, { notes: v })}
            className="text-muted-foreground"
            readOnly={readOnly}
          />
        </TableCell>
        <TableCell>
          {canWrite ? (
            <div className="flex items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => h.onAddUrl(vm.id)}
                title="Add a VM-owned URL (a project's URLs are added from the project)"
                className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-4" />
              </button>
              {/* Which machine runs Jenkins is a property of the machine, so its
                  marker (and the form behind it) lives on the VM row. */}
              <VmJenkinsDialog vm={vm} canWrite={canWrite} />
              <button
                type="button"
                onClick={() => h.onToggleClient(vm)}
                title={
                  vm.isClient
                    ? 'Client VM — click to move to UPVIEW'
                    : 'UPVIEW VM — click to move to Client'
                }
                className={cn(
                  'inline-flex h-7 items-center justify-center rounded-md border px-2 text-xs font-bold',
                  vm.isClient
                    ? 'border-transparent bg-steel-600 text-steel-50'
                    : 'border-steel-400 bg-transparent text-steel-600 dark:text-steel-300'
                )}
              >
                {vm.isClient ? 'C' : 'UV'}
              </button>
              <button
                type="button"
                onClick={() => h.onTrash(vm.id)}
                title="Delete VM"
                className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            // Keep the section badge readable at a glance even without the
            // move-to-Client button that normally shows it. The Jenkins marker
            // stays: it is information, not an action.
            <div className="flex items-center justify-center gap-1 text-xs font-bold text-muted-foreground">
              <VmJenkinsDialog vm={vm} canWrite={false} />
              {vm.isClient ? 'C' : 'UV'}
            </div>
          )}
        </TableCell>
      </TableRow>

      {/* URL rows */}
      {vm.expanded &&
        vm.urls.map((u) => (
          <TableRow key={`url-${vm.id}-${u.id}`}>
            <TableCell className="w-16 bg-primary/60" />
            <TableCell className="py-0.5 pl-5 text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden>↳</span>
                <UrlOwnerBadge url={u} />
              </div>
            </TableCell>
            <TableCell className="text-xs text-ink-source">{vm.oldIp}</TableCell>
            <TableCell className="text-xs text-ink-target">{vm.newIp}</TableCell>
            <TableCell className="py-0.5">
              <CellInput
                value={u.port}
                placeholder="443"
                onChange={(v) => h.onUrlLocalChange(vm.id, u.id, { port: v })}
                onCommit={(v) => h.onUrlCommit(vm.id, u.id, { port: v })}
                className="text-center font-semibold text-ink-accent"
                readOnly={readOnly}
              />
            </TableCell>
            <TableCell className="py-0.5">
              <CellInput
                value={u.url}
                placeholder="https://example.com"
                onChange={(v) => h.onUrlLocalChange(vm.id, u.id, { url: v })}
                onCommit={(v) => h.onUrlCommit(vm.id, u.id, { url: v })}
                readOnly={readOnly}
              />
            </TableCell>
            <TableCell className="truncate text-xs font-medium">
              {buildFullUrl(u.proto, vm.newIp, u.port) || (
                <span className="text-muted-foreground/60">auto-built</span>
              )}
            </TableCell>
            <TableCell className="text-center">
              <YesNoToggle
                value={u.dns}
                onChange={(v) => h.onUrlCommit(vm.id, u.id, { dns: v })}
                readOnly={readOnly}
              />
            </TableCell>
            <TableCell className="text-center">
              <YesNoToggle
                value={u.tested}
                onChange={(v) => h.onUrlCommit(vm.id, u.id, { tested: v })}
                readOnly={readOnly}
              />
            </TableCell>
            <TableCell colSpan={4} />
            <TableCell className="py-0.5">
              <CellInput
                value={u.notes}
                placeholder="notes..."
                onChange={(v) => h.onUrlLocalChange(vm.id, u.id, { notes: v })}
                onCommit={(v) => h.onUrlCommit(vm.id, u.id, { notes: v })}
                className="text-muted-foreground"
                readOnly={readOnly}
              />
            </TableCell>
            <TableCell className="text-center">
              {/* Only a VM-owned row can be deleted here. A project's record is
                  removed from that project's environment — the badge in the
                  Name column is the way there — so the projects page can't lose
                  rows to a page that never created them. `vmService.deleteUrl`
                  enforces it; this only hides the button. */}
              {canWrite && !u.environmentId ? (
                <button
                  type="button"
                  onClick={() => h.onDeleteUrl(vm.id, u.id)}
                  title="Delete URL"
                  className="inline-flex size-6 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}

      {/* Inline add-URL row */}
      {vm.expanded && canWrite && (
        <TableRow className="hover:bg-transparent">
          <TableCell className="w-16 bg-primary/60" />
          <TableCell colSpan={TRACKER_COLUMNS - 1} className="py-1 pl-5">
            <button
              type="button"
              onClick={() => h.onAddUrl(vm.id)}
              className="rounded-md border border-dashed border-primary/50 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            >
              + Add URL to {vm.name || 'this VM'}
            </button>
          </TableCell>
        </TableRow>
      )}

      {/* Migrated-from history */}
      {vm.expanded && <MigratedFrom vm={vm} allVms={allVms} allDeleted={allDeleted} />}
    </>
  );
}
