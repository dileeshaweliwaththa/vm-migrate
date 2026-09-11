'use client';

import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { buildFullUrl, migratedSources } from '@/lib/vm-utils';
import type { Vm, VmUrl } from '@/types/common/vm';
import { VmJenkinsDialog } from './vm-jenkins-dialog';
import {
  CellInput,
  StatusPill,
  UrlOwnerBadge,
  VmSelectCheckbox,
  type VmHandlers,
} from './vm-fields';
import { YesNoToggle } from './yes-no-toggle';

// The card arrangement of a VM — the same data, the same handlers, and the same
// `vm.expanded` flag as `VmRow`, so a VM opened in one view is open in the other
// and Expand All / Collapse All drive both. It is a re-layout, not a second
// feature; anything it needs to derive comes from lib/vm-utils rather than being
// worked out again here.

// A labelled value. The table carries its labels in the header row, which a card
// doesn't have — so every value states what it is.
function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function UrlItem({
  vm,
  url,
  h,
  canWrite,
}: {
  vm: Vm;
  url: VmUrl;
  h: VmHandlers;
  canWrite: boolean;
}) {
  const readOnly = !canWrite;
  const full = buildFullUrl(url.proto, vm.newIp, url.port);

  return (
    <li className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <CellInput
          variant="field"
          value={url.port}
          placeholder="443"
          onChange={(v) => h.onUrlLocalChange(vm.id, url.id, { port: v })}
          onCommit={(v) => h.onUrlCommit(vm.id, url.id, { port: v })}
          className="w-16 shrink-0 text-center font-semibold text-ink-accent"
          readOnly={readOnly}
        />
        {/* VM-owned rows only — a project's record is deleted from its project
            (the badge below links there), same rule as the grid. */}
        {canWrite && !url.environmentId ? (
          <button
            type="button"
            onClick={() => h.onDeleteUrl(vm.id, url.id)}
            title="Delete URL"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <CellInput
        variant="field"
        value={url.url}
        placeholder="https://example.com"
        onChange={(v) => h.onUrlLocalChange(vm.id, url.id, { url: v })}
        onCommit={(v) => h.onUrlCommit(vm.id, url.id, { url: v })}
        readOnly={readOnly}
      />

      {/* The built address, same helper as the grid's "Full New URL" column, and
          the owner badge the grid puts in its Name column. */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate font-mono text-label-mono text-muted-foreground">
          {full || <span className="text-muted-foreground/60">auto-built</span>}
        </p>
        <UrlOwnerBadge url={url} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            DNS
          </span>
          <YesNoToggle
            value={url.dns}
            onChange={(v) => h.onUrlCommit(vm.id, url.id, { dns: v })}
            readOnly={readOnly}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Tested
          </span>
          <YesNoToggle
            value={url.tested}
            onChange={(v) => h.onUrlCommit(vm.id, url.id, { tested: v })}
            readOnly={readOnly}
          />
        </div>
      </div>

      <CellInput
        variant="field"
        value={url.notes}
        placeholder="notes…"
        onChange={(v) => h.onUrlLocalChange(vm.id, url.id, { notes: v })}
        onCommit={(v) => h.onUrlCommit(vm.id, url.id, { notes: v })}
        className="text-muted-foreground"
        readOnly={readOnly}
      />
    </li>
  );
}

export function VmCard({
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
  // Editor+ — false for a viewer. Expand/collapse stays available either way: it
  // is local view state, not data.
  canWrite: boolean;
  // Ticked for grouping — the same flag the grid row takes, so a VM selected in
  // one view is selected in the other.
  selected?: boolean;
}) {
  const readOnly = !canWrite;
  const sources = migratedSources(vm, allVms, allDeleted);
  const urlCount = `${vm.urls.length} URL${vm.urls.length === 1 ? '' : 's'}`;

  return (
    <Card className="min-w-0 rounded-lg shadow-none transition-colors hover:border-input">
      <CardHeader className="gap-2 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          {/* Ahead of the name, where the grid's tick also sits. */}
          {canWrite ? (
            <VmSelectCheckbox
              checked={selected}
              onCheckedChange={() => h.onToggleSelect(vm.id)}
              label={`Select ${vm.name || 'this VM'}`}
              className="mt-2 shrink-0"
            />
          ) : null}
          <CellInput
            value={vm.name}
            placeholder="vm-name"
            onChange={(v) => h.onVmLocalChange(vm.id, { name: v })}
            onCommit={(v) => h.onVmCommit(vm.id, { name: v })}
            className="font-display text-headline-md font-bold tracking-normal uppercase"
            readOnly={readOnly}
          />
          {canWrite ? (
            <div className="flex shrink-0 items-center gap-1">
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
            // Same fallback as the grid: keep the section badge legible without
            // the move-to-Client button that normally carries it.
            <span className="shrink-0 text-xs font-bold text-muted-foreground">
              {vm.isClient ? 'C' : 'UV'}
            </span>
          )}
        </div>
        <StatusPill vm={vm} />
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-0">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Old IP">
            <CellInput
              variant="field"
              value={vm.oldIp}
              placeholder="0.0.0.0"
              onChange={(v) => h.onVmLocalChange(vm.id, { oldIp: v })}
              onCommit={(v) => h.onVmCommit(vm.id, { oldIp: v })}
              className="text-ink-source"
              readOnly={readOnly}
            />
          </Field>
          <Field label="New IP">
            <CellInput
              variant="field"
              value={vm.newIp}
              placeholder="0.0.0.0"
              onChange={(v) => h.onVmLocalChange(vm.id, { newIp: v })}
              onCommit={(v) => h.onVmCommit(vm.id, { newIp: v })}
              className="text-ink-target"
              readOnly={readOnly}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Migrated">
            <YesNoToggle
              value={vm.migrated}
              onChange={(v) => h.onVmCommit(vm.id, { migrated: v })}
              readOnly={readOnly}
            />
          </Field>
          <Field label="Supabase">
            <YesNoToggle
              value={vm.isSupabase}
              onChange={(v) => h.onVmCommit(vm.id, { isSupabase: v })}
              readOnly={readOnly}
            />
          </Field>
          <Field label="Not migrating">
            <YesNoToggle
              value={vm.keep}
              onChange={(v) => h.onVmCommit(vm.id, { keep: v })}
              readOnly={readOnly}
            />
          </Field>
        </div>

        <Field label="Notes">
          <CellInput
            variant="field"
            value={vm.notes}
            placeholder="notes…"
            onChange={(v) => h.onVmLocalChange(vm.id, { notes: v })}
            onCommit={(v) => h.onVmCommit(vm.id, { notes: v })}
            className="text-muted-foreground"
            readOnly={readOnly}
          />
        </Field>

        <div className="space-y-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => h.onToggleExpand(vm)}
            aria-expanded={vm.expanded}
            className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-foreground"
          >
            <span className="font-mono text-label-mono text-ink-source">{urlCount}</span>
            {vm.expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
          </button>

          {vm.expanded ? (
            vm.urls.length === 0 ? (
              <p className="py-1 text-sm text-muted-foreground">No URLs yet.</p>
            ) : (
              <ul className="space-y-2">
                {vm.urls.map((u) => (
                  <UrlItem key={u.id} vm={vm} url={u} h={h} canWrite={canWrite} />
                ))}
              </ul>
            )
          ) : null}

          {/* Not gated on `expanded`: adding a URL opens the card anyway (the
              handler sets it), so hiding this until it was open would mean
              expanding first just to reach the button. */}
          {canWrite ? (
            <button
              type="button"
              onClick={() => h.onAddUrl(vm.id)}
              className="w-full rounded-md border border-dashed border-primary/50 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              + Add URL
            </button>
          ) : null}
        </div>

        {/* Migrated-from history, on the same expanded flag as the grid's rows.
            Per-source only — the grid also lists each migrated URL underneath,
            which at card width would bury the VM's own fields. */}
        {vm.expanded && sources.length > 0 ? (
          <div className="space-y-1.5 rounded-md bg-steel-800 p-2">
            <p className="text-[10px] font-bold tracking-wide text-steel-400 uppercase">
              ⬆ Migrated from
            </p>
            <ul className="space-y-1">
              {sources.map((src) => (
                <li key={`mig-${vm.id}-${src.id}`} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-steel-50">
                    {src.name || '(unnamed)'}
                  </span>
                  <span className="font-mono text-[10px] text-steel-300">
                    {src.oldIp} → {src.newIp}
                  </span>
                  <span className="text-[10px] text-steel-400">
                    {src.urls.length} URL{src.urls.length === 1 ? '' : 's'}
                  </span>
                  {src.tag ? (
                    <span
                      className={cn(
                        'rounded-sm px-2 py-0.5 text-[9px] font-bold text-steel-900',
                        src.tag === 'ARCHIVED' ? 'bg-steel-400' : 'bg-steel-50'
                      )}
                    >
                      {src.tag}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
