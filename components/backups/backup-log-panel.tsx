'use client';

import { ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BackupLogPage } from '@/types/common/backup';

// A run's progress, in a panel that is always there.
//
// It keeps its place whether or not anything is running — an empty log box says
// "this is where the run will appear", where a panel that only exists mid-run
// makes the page jump and leaves nothing to look at afterwards. The worker
// persists each session's events, so the last run's lines are still here after a
// reload.
export function BackupLogPanel({
  logs,
  running,
}: {
  logs: BackupLogPage | undefined;
  running: boolean;
}) {
  const events = logs?.events ?? [];

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-label-caps uppercase text-muted-foreground">
          <ScrollText className="size-3.5" />
          Backup logs
        </p>
        {/* State as a word. The dot is a second channel on the same fact, never
            the only one (docs/ui-guidelines.md § Status tones). */}
        <Badge
          variant="outline"
          className="rounded-sm text-label-caps uppercase"
        >
          {running ? (
            <>
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent-step" />
              Running
            </>
          ) : (
            'Ready'
          )}
        </Badge>
        {events.length ? (
          <span className="font-mono text-label-mono text-muted-foreground">
            {events.length} line{events.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {/* Dark, mono and bounded: this is console output, and a full run over
          eighteen databases writes hundreds of lines. */}
      <div className="max-h-64 overflow-auto rounded-md bg-steel-900 p-3">
        {events.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-mono text-label-mono text-steel-300">No backup logs yet</p>
            <p className="mt-1 font-mono text-label-mono text-steel-400">
              Lines appear here while a backup runs
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {events.map((event) => (
              <li
                key={`${logs?.sessionId ?? 'session'}-${event.seq}`}
                className="font-mono text-label-mono text-steel-100"
              >
                {event.timestamp ? (
                  <span className="text-steel-400">{event.timestamp} </span>
                ) : null}
                {event.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
