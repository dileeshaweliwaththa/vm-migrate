'use client';

import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASS } from '@/lib/vm-utils';

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
  // Yes/No is the same success/danger vocabulary as every other pill in the app,
  // so it reads from the shared tone map rather than naming its own colours.
  const tone = STATUS_TONE_CLASS[value ? 'success' : 'danger'];
  const base =
    'inline-flex min-w-14 items-center justify-center rounded-sm px-2.5 py-0.5 text-xs font-semibold';

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
      // One hover rule for both states: the tone already carries the hue, so
      // darkening it slightly needs no second set of colour classes.
      className={cn(base, tone, 'transition-opacity hover:opacity-75')}
    >
      {value ? 'Yes' : 'No'}
    </button>
  );
}
