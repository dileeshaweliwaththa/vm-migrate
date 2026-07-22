'use client';

import { cn } from '@/lib/utils';

// A compact Yes/No pill toggle used across the tracker grid. Pure and
// presentational: it shows the current boolean and fires onChange with the
// flipped value.
export function YesNoToggle({
  value,
  onChange,
  title,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onChange(!value)}
      className={cn(
        'inline-flex min-w-14 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        value
          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60'
          : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-900/60'
      )}
    >
      {value ? 'Yes' : 'No'}
    </button>
  );
}
