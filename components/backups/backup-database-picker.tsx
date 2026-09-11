'use client';

import { Play, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// Which databases to dump. A run takes a list and treats an empty one as "all",
// so this is a multi-select with two shortcuts, because that is how the job is
// actually decided: usually everything, sometimes one that failed.
//
// `ToggleGroup type="multiple"`, not a row of checkboxes: nineteen labelled chips
// in a wrapped row is denser and reads as one control. It styles on
// `data-[state=on]`, which radix-ui 1.4.3 does emit — `ui/tabs` and `ui/switch`
// are the primitives that don't (docs/ui-guidelines.md).
//
// **`canManage: false` renders the same list as plain labels.** Which databases
// are on a server, and therefore what is being backed up, is the most useful
// thing on the page for someone who cannot press anything — so a viewer sees the
// list rather than an empty panel or a row of dead controls.
// One chip. Shared so the read-only list is visibly the same list, not a second
// rendering that drifts from it.
const CHIP_CLASS =
  'rounded-sm border border-border px-2.5 font-mono text-label-mono';

export function BackupDatabasePicker({
  databases,
  selected,
  onSelectedChange,
  onRun,
  running,
  disabled,
  canManage,
}: {
  databases: string[];
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  onRun: () => void;
  running: boolean;
  disabled: boolean;
  canManage: boolean;
}) {
  if (databases.length === 0) return null;

  if (!canManage) {
    return (
      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label-caps uppercase text-muted-foreground">Databases</p>
          <span className="font-mono text-label-mono text-muted-foreground">
            {databases.length} on this server
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {databases.map((name) => (
            <span key={name} className={`${CHIP_CLASS} inline-flex h-8 items-center`}>
              {name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Nothing ticked means every database, which is the worker's own default for a
  // missing list — so the button says which of the two it is about to do.
  const all = selected.length === 0 || selected.length === databases.length;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label-caps uppercase text-muted-foreground">Select databases</p>
        <span className="font-mono text-label-mono text-muted-foreground">
          {all ? `all ${databases.length}` : `${selected.length} of ${databases.length}`}
        </span>
      </div>

      <ToggleGroup
        type="multiple"
        value={selected}
        onValueChange={onSelectedChange}
        className="flex-wrap justify-start gap-1"
        disabled={disabled}
      >
        {databases.map((name) => (
          <ToggleGroupItem
            key={name}
            value={name}
            className={`${CHIP_CLASS} data-[state=on]:border-accent-step data-[state=on]:bg-accent-step data-[state=on]:text-white`}
          >
            {name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onRun} disabled={disabled || running}>
          {running ? <Upload className="size-4" /> : <Play className="size-4" />}
          {running
            ? 'Backing up…'
            : all
              ? 'Back up all databases'
              : `Back up ${selected.length} database${selected.length === 1 ? '' : 's'}`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSelectedChange(databases)}
          disabled={disabled}
        >
          Select all
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onSelectedChange([])}
          disabled={disabled || selected.length === 0}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
