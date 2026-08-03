'use client';

import { cn } from '@/lib/utils';

// A compact Yes/No pill toggle used across the tracker grid. Pure and
// presentational: it shows the current boolean and fires onChange with the
// flipped value.
//
// `readOnly` renders the same pill without the button semantics or hover
// affordance — what a viewer sees, since the tracker is read-only for them.
export function YesNoToggle({
  value,
  onChange,
  title,
  readOnly = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  title?: string;
  readOnly?: boolean;
}) {
  const tone = value
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
    : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300';
  const base =
    'inline-flex min-w-14 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold';

  if (readOnly) {
    return (
      <span title={title} className={cn(base, tone)}>
        {value ? 'Yes' : 'No'}
      </span>
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={() => onChange(!value)}
      className={cn(
        base,
        'transition-colors',
        tone,
        value
          ? 'hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
          : 'hover:bg-red-200 dark:hover:bg-red-900/60'
      )}
    >
      {value ? 'Yes' : 'No'}
    </button>
  );
}
