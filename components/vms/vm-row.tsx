'use client';

import { Fragment } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { buildFullUrl, safeStatus, STATUS_TONE_CLASS } from '@/lib/vm-utils';
import { PROTOCOLS, type Vm, type VmUrl, type Protocol } from '@/types/common/vm';
import { YesNoToggle } from './yes-no-toggle';

export const TRACKER_COLUMNS = 16;

export interface VmRowHandlers {
  onToggleExpand: (vm: Vm) => void;
  onVmLocalChange: (id: string, patch: Partial<Vm>) => void;
  onVmCommit: (id: string, patch: Partial<Vm>) => void;
  onToggleClient: (vm: Vm) => void;
  onTrash: (id: string) => void;
  onAddUrl: (vmId: string) => void;
  onUrlLocalChange: (vmId: string, urlId: string, patch: Partial<VmUrl>) => void;
  onUrlCommit: (vmId: string, urlId: string, patch: Partial<VmUrl>) => void;
  onDeleteUrl: (vmId: string, urlId: string) => void;
}

// A borderless, transparent cell editor composed from the shadcn Input.
//
// `readOnly` renders the value as plain text rather than a disabled input: a
// viewer gets a clean grid instead of a form full of dead fields.
function CellInput({
  value,
  onChange,
  onCommit,
  placeholder,
  className,
  readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <div
        className={cn(
          'flex h-7 items-center px-1 text-sm',
          !value && 'text-muted-foreground/50',
          className
        )}
      >
        {value || '—'}
      </div>
    );
  }

  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
      className={cn(
        'h-7 rounded-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent',
        className
      )}
    />
  );
}

function StatusPill({ vm }: { vm: Vm }) {
  const status = safeStatus(vm);
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        STATUS_TONE_CLASS[status.tone]
      )}
    >
      {status.label}
    </span>
  );
}

// Read-only rows shown under a "primary" destination VM for every source VM
// (active, trashed, or archived) that migrated its URLs onto this IP.
function MigratedFrom({ vm, allVms, allDeleted }: { vm: Vm; allVms: Vm[]; allDeleted: Vm[] }) {
  const isPrimary = vm.oldIp === vm.newIp && !!vm.newIp;
  if (!isPrimary) return null;

  const active = allVms
    .filter((s) => s.id !== vm.id && s.newIp === vm.newIp && s.oldIp !== s.newIp)
    .map((s) => ({ src: s, tag: null as string | null }));
  const trashed = allDeleted
    .filter((s) => s.newIp === vm.newIp && s.oldIp !== s.newIp)
    .map((s) => ({ src: s, tag: 'IN TRASH' as const }));
  const archived = (vm.migratedArchive ?? []).map((s) => ({
    src: { ...s, urls: s.urls } as unknown as Vm,
    tag: 'ARCHIVED' as const,
  }));

  const sources = [...active, ...trashed, ...archived];
  if (sources.length === 0) return null;

  return (
    <>
      {sources.map(({ src, tag }) => (
        <Fragment key={`mig-${vm.id}-${src.id}`}>
          <TableRow className="hover:bg-transparent">
            <TableCell className="w-9 bg-mauve-700" />
            <TableCell colSpan={TRACKER_COLUMNS - 1} className="bg-mauve-800 py-1.5 text-mauve-100">
              <span className="text-[10px] font-bold tracking-wide text-mauve-400 uppercase">
                ⬆ Migrated from:{' '}
              </span>
              <span className="text-xs font-semibold text-mauve-50">{src.name || '(unnamed)'}</span>
              <span className="ml-2 text-[10px] text-mauve-300">
                {src.oldIp} → {src.newIp}
              </span>
              {tag ? (
                <span
                  className={cn(
                    'ml-2 rounded-full px-2 py-0.5 text-[9px] font-bold text-mauve-900',
                    tag === 'ARCHIVED' ? 'bg-mauve-400' : 'bg-mauve-50'
                  )}
                >
                  {tag}
                </span>
              ) : null}
            </TableCell>
          </TableRow>
          {src.urls.map((u) => (
            <TableRow key={`mig-url-${vm.id}-${src.id}-${u.id}`} className="hover:bg-transparent">
              <TableCell className="w-9 bg-mauve-700" />
              <TableCell className="bg-mauve-800 py-1 pl-5">
                <span className="rounded-full bg-mauve-400 px-2 py-0.5 text-[9px] font-bold tracking-wide text-mauve-900">
                  MIGRATED
                </span>
              </TableCell>
              <TableCell className="bg-mauve-800 text-center text-xs text-mauve-400">
                {src.oldIp}
              </TableCell>
              <TableCell className="bg-mauve-800 text-center text-xs text-mauve-100">
                {src.newIp}
              </TableCell>
              <TableCell className="bg-mauve-800 text-center text-xs font-semibold text-mauve-100">
                {u.port}
              </TableCell>
              <TableCell className="bg-mauve-800 text-center text-xs text-mauve-300">
                {u.proto}
              </TableCell>
              <TableCell className="bg-mauve-800 text-xs text-mauve-300">{u.url}</TableCell>
              <TableCell className="bg-mauve-800 text-xs font-medium text-mauve-100">
                {buildFullUrl(u.proto, src.newIp, u.port)}
              </TableCell>
              <TableCell className="bg-mauve-800 text-center text-xs text-mauve-200">
                {u.dns ? 'Yes' : 'No'}
              </TableCell>
              <TableCell className="bg-mauve-800 text-center text-xs text-mauve-200">
                {u.tested ? 'Yes' : 'No'}
              </TableCell>
              <TableCell className="bg-mauve-800" colSpan={4} />
              <TableCell className="bg-mauve-800 text-xs text-mauve-400">{u.notes}</TableCell>
              <TableCell className="bg-mauve-800" />
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
}: {
  vm: Vm;
  allVms: Vm[];
  allDeleted: Vm[];
  h: VmRowHandlers;
  // Editor+ — false for a viewer, who sees the grid but no editing controls.
  // Expand/collapse stays available either way: it is local view state, not data.
  canWrite: boolean;
}) {
  const readOnly = !canWrite;

  return (
    <>
      {/* VM row */}
      <TableRow className="border-b-2 border-b-primary/40 bg-muted/40 hover:bg-muted/60">
        <TableCell className="w-9 p-0 text-center">
          <button
            type="button"
            onClick={() => h.onToggleExpand(vm)}
            className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-expanded={vm.expanded}
            title={vm.expanded ? 'Collapse' : 'Expand'}
          >
            {vm.expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
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
            className="text-center text-ink-source"
            readOnly={readOnly}
          />
        </TableCell>
        <TableCell className="py-1">
          <CellInput
            value={vm.newIp}
            placeholder="0.0.0.0"
            onChange={(v) => h.onVmLocalChange(vm.id, { newIp: v })}
            onCommit={(v) => h.onVmCommit(vm.id, { newIp: v })}
            className="text-center text-ink-target"
            readOnly={readOnly}
          />
        </TableCell>
        <TableCell className="text-center text-xs text-muted-foreground">
          {vm.urls.length} URL{vm.urls.length !== 1 ? 's' : ''}
        </TableCell>
        <TableCell colSpan={5} />
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
                title="Add URL row"
                className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-4" />
              </button>
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
                    ? 'border-transparent bg-mauve-600 text-mauve-50'
                    : 'border-mauve-400 bg-transparent text-mauve-600 dark:text-mauve-300'
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
            // move-to-Client button that normally shows it.
            <div className="text-center text-xs font-bold text-muted-foreground">
              {vm.isClient ? 'C' : 'UV'}
            </div>
          )}
        </TableCell>
      </TableRow>

      {/* URL rows */}
      {vm.expanded &&
        vm.urls.map((u) => (
          <TableRow key={`url-${vm.id}-${u.id}`}>
            <TableCell className="w-9 bg-primary/60" />
            <TableCell className="py-0.5 pl-5 text-muted-foreground">↳</TableCell>
            <TableCell className="text-center text-xs text-ink-source">
              {vm.oldIp}
            </TableCell>
            <TableCell className="text-center text-xs text-ink-target">
              {vm.newIp}
            </TableCell>
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
              {canWrite ? (
                <Select
                  value={u.proto}
                  onValueChange={(v) => h.onUrlCommit(vm.id, u.id, { proto: v as Protocol })}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-full border-0 bg-transparent shadow-none"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROTOCOLS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-7 items-center px-1 text-sm">{u.proto}</div>
              )}
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
            <TableCell className="text-xs font-medium">
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
              {canWrite ? (
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
          <TableCell className="w-9 bg-primary/60" />
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
