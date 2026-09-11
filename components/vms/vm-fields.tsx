'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { safeStatus, STATUS_PILL_CLASS, STATUS_TONE_CLASS } from '@/lib/vm-utils';
import type { Vm, VmUrl } from '@/types/common/vm';

// The pieces both tracker views are built from — the field editor, the status
// pill, and the handler contract. They live here rather than in `vm-row.tsx`
// because `vm-card.tsx` renders the same data with the same callbacks: a card is
// a different arrangement of one VM, not a different feature. Anything that
// forked would let the two views disagree about what a VM is.

export interface VmHandlers {
  onToggleExpand: (vm: Vm) => void;
  // Selection for the grouping actions. Both views take it for the same reason
  // they share everything else: a VM ticked in the grid is ticked in the cards.
  onToggleSelect: (id: string) => void;
  onVmLocalChange: (id: string, patch: Partial<Vm>) => void;
  onVmCommit: (id: string, patch: Partial<Vm>) => void;
  onToggleClient: (vm: Vm) => void;
  onTrash: (id: string) => void;
  onAddUrl: (vmId: string) => void;
  onUrlLocalChange: (vmId: string, urlId: string, patch: Partial<VmUrl>) => void;
  onUrlCommit: (vmId: string, urlId: string, patch: Partial<VmUrl>) => void;
  onDeleteUrl: (vmId: string, urlId: string) => void;
}

// An editable value, in one of two dresses:
//
// - `cell` — borderless and transparent, for the grid. A table row full of
//   bordered boxes reads as a form, not a spreadsheet.
// - `field` — the plain shadcn Input, for the card, where each value sits on
//   its own under a label and needs an edge to look editable at all.
//
// `readOnly` renders plain text rather than a disabled input, so a viewer gets
// a clean surface instead of a form full of dead controls.
export function CellInput({
  value,
  onChange,
  onCommit,
  placeholder,
  className,
  readOnly = false,
  variant = 'cell',
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  variant?: 'cell' | 'field';
}) {
  if (readOnly) {
    return (
      <div
        className={cn(
          'flex items-center text-sm',
          variant === 'cell'
            ? 'h-7 px-1'
            : 'h-8 rounded-md border border-border bg-muted/40 px-3',
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
        variant === 'cell'
          ? 'h-7 rounded-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent'
          : 'h-8',
        className
      )}
    />
  );
}

// The selection tick shared by the grid, the cards and the select-all header.
//
// `ui/checkbox.tsx` is one of the generated primitives written for Radix 2.x: its
// checked styling is all `data-checked:*`, a boolean attribute 1.4.3 never emits,
// so a ticked box would render as a bare check with no fill. The overrides below
// restate it on `data-[state=checked]`, which 1.4.3 does emit — same class
// groups, so tailwind-merge drops the dead ones. Kept here, in one place, rather
// than copied into each view: a copy that drifts fails silently. See
// docs/ui-guidelines.md § Generated primitives target Radix 2.x.
export function VmSelectCheckbox({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      aria-label={label}
      title={label}
      className={cn(
        'border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className
      )}
    />
  );
}

// Where a URL row comes from. There is one `endpoints` table behind both
// pages, so a row shown here may have been added from a project environment —
// this says which one, and links to it, because that is where it is added and
// deleted. A VM-owned row (added in the tracker) gets no badge: unlabelled is
// the tracker's own, which keeps the dense grid quiet in the common case.
//
// Shared by the grid and the cards. Tolerates a row read back from a
// `migrated_archive` snapshot written before endpoints were unified, where the
// ownership fields simply aren't there.
export function UrlOwnerBadge({ url }: { url: VmUrl }) {
  if (!url.environmentId) return null;

  const label = [url.projectName, url.environmentName].filter(Boolean).join(' · ');
  const badge = (
    <Badge
      variant="outline"
      title={
        label
          ? `Added from ${label} — edit here, but add or remove it on the project`
          : 'Belongs to a project environment'
      }
      className="max-w-[12rem] rounded-sm bg-muted/50 px-1.5 font-mono text-label-mono font-medium text-muted-foreground"
    >
      <span className="truncate">{label || 'Project'}</span>
    </Badge>
  );

  // The project id is what the badge needs to link anywhere; without it (an
  // archived snapshot) the label still tells you where the row came from.
  if (!url.projectId) return badge;
  return (
    <Link href={`/projects/${url.projectId}`} className="min-w-0">
      {badge}
    </Link>
  );
}

export function StatusPill({ vm }: { vm: Vm }) {
  const status = safeStatus(vm);
  return (
    <span
      className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS[status.tone])}
    >
      {status.label}
    </span>
  );
}
