'use client';

import { useSyncExternalStore } from 'react';
import { LayoutGrid, Table2 } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// How the tracker lays a VM out. One source of truth for the set, per AGENTS.md
// §types — the storage guard, the toggle and the tracker all read it.
export const VM_VIEWS = ['table', 'cards'] as const;
export type VmView = (typeof VM_VIEWS)[number];

const STORAGE_KEY = 'vm-tracker-view';
// The grid is the tracker's working surface — the view someone lands on to do a
// migration pass — so it stays the default for anyone who hasn't chosen.
const DEFAULT_VIEW: VmView = 'table';

const isVmView = (value: string | null): value is VmView =>
  VM_VIEWS.includes(value as VmView);

// localStorage is an external store, so it is read through
// `useSyncExternalStore` rather than mirrored into state by an effect. Three
// things fall out of that which the effect version got wrong or missed:
//
//   - **No hydration mismatch.** The server snapshot is the default, so the
//     markup React hydrates always matches; the stored value is applied in the
//     commit right after, not a render later.
//   - **No cascading render** — which is what `react-hooks/set-state-in-effect`
//     objects to in the effect form.
//   - **Other tabs stay in sync**, because `storage` fires there.
//
// `storage` does *not* fire in the tab that wrote the value, so writers notify
// the local listeners themselves.
const listeners = new Set<() => void>();

const subscribe = (onStoreChange: () => void) => {
  listeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
};

// Returns a primitive, so React's identity check is a value comparison and the
// snapshot needs no caching.
const getSnapshot = (): VmView => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isVmView(stored) ? stored : DEFAULT_VIEW;
};

const getServerSnapshot = (): VmView => DEFAULT_VIEW;

export function useVmView(): [VmView, (next: VmView) => void] {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const choose = (next: VmView) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    listeners.forEach((notify) => notify());
  };

  return [view, choose];
}

// `ToggleGroup`, not `ui/tabs` — same reason as the projects tag filter: the
// generated tabs primitive styles on Radix 2.x boolean data attributes that
// 1.4.3 never emits, so it renders as an empty block. See docs/ui-guidelines.md.
export function VmViewToggle({
  value,
  onChange,
}: {
  value: VmView;
  onChange: (next: VmView) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      // Radix fires an empty string when the pressed item is clicked again.
      // Ignoring it keeps a view always selected — there is no "neither".
      onValueChange={(next) => next && onChange(next as VmView)}
      aria-label="Tracker layout"
      className="gap-0.5 rounded-sm border border-border bg-muted p-0.5"
    >
      <ToggleGroupItem
        value="table"
        title="Table view"
        className="h-7 gap-1.5 rounded-sm px-2.5 text-xs data-[state=on]:bg-card data-[state=on]:font-medium data-[state=on]:text-foreground"
      >
        <Table2 className="size-4" /> Table
      </ToggleGroupItem>
      <ToggleGroupItem
        value="cards"
        title="Card view"
        className="h-7 gap-1.5 rounded-sm px-2.5 text-xs data-[state=on]:bg-card data-[state=on]:font-medium data-[state=on]:text-foreground"
      >
        <LayoutGrid className="size-4" /> Cards
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
