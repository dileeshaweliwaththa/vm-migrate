'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { safeStatus, STATUS_TONE_CLASS } from '@/lib/vm-utils';
import type { Vm, VmUrl } from '@/types/common/vm';

// The pieces both tracker views are built from — the field editor, the status
// pill, and the handler contract. They live here rather than in `vm-row.tsx`
// because `vm-card.tsx` renders the same data with the same callbacks: a card is
// a different arrangement of one VM, not a different feature. Anything that
// forked would let the two views disagree about what a VM is.

export interface VmHandlers {
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

export function StatusPill({ vm }: { vm: Vm }) {
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
