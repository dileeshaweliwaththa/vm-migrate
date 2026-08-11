'use client';

import { useSyncExternalStore } from 'react';
import { CalendarDays } from 'lucide-react';

// Today's date, shown in the top bar.
//
// Client-only on purpose. Formatting on the server would use the *server's*
// timezone, so around midnight the two would disagree on the day and React would
// report a hydration mismatch.
//
// The "am I on the client yet?" check is `useSyncExternalStore` rather than a
// mount effect: it is allowed to return a different value on the server and the
// client, so there is no mismatch and no `setState` inside an effect (which the
// react-hooks lint rejects). `getSnapshot` returns a constant, so it never
// re-renders in a loop.
const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

// Explicit `en-GB` rather than the visitor's locale, so the order stays
// "Wed, 05 Aug 2026" for everyone — this is chrome, not user data.
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

export function CurrentDate() {
  const isClient = useSyncExternalStore(neverChanges, onClient, onServer);

  // Read at render time, not stored: there is nothing to keep in sync. A page left
  // open across midnight keeps yesterday's date until the next navigation, which
  // is an acceptable trade for having no timer.
  const today = isClient ? new Date().toLocaleDateString('en-GB', DATE_FORMAT) : null;

  return (
    // A raised chip against the translucent bar — `bg-card` rather than
    // transparent, which is what separates it from the breadcrumb text beside it.
    // No `aria-label`: ARIA prohibits a name on the `generic` role, so browsers
    // discard it — and where it is honoured it *replaces* the visible date rather
    // than adding to it. The text is already its own accessible name.
    <div className="hidden h-9 items-center gap-2 rounded-sm border border-border bg-card px-3 text-body-sm sm:inline-flex">
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {/* Reserves the width the date will take, so the bar doesn't jump on mount. */}
      <span className="min-w-[8.5rem] tabular-nums">{today}</span>
    </div>
  );
}
