'use client';

import { useEffect, useRef } from 'react';
import { ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { describeBackupEvent, isBackupEventError } from '@/lib/backup-utils';
import type { BackupLogEvent } from '@/types/common/backup';

// A run's progress, in a panel that is always there.
//
// The lines are `backup_run_events` rows written by the runner as it works, so
// they survive a reload, show up for anyone watching, and are still here after
// the run finishes — unlike the in-memory stream the external worker offered.
//
// It keeps its place whether or not anything is running: an empty box says "this
// is where the run will appear", where a panel that only exists mid-run makes the
// page jump and leaves nothing to look at afterwards.
export function BackupLogPanel({
  events,
  running,
}: {
  events: BackupLogEvent[];
  // Whether a backup is in progress for this target.
  running: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // Follow the tail. A full run is a hundred-odd lines and the interesting one is
  // always the newest, so the box scrolls itself rather than being scrolled.
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [events.length]);

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-label-caps uppercase text-muted-foreground">
          <ScrollText className="size-3.5" />
          Backup logs
        </p>
        {/* State as a word. The dot is a second channel on the same fact, never
            the only one (docs/ui-guidelines.md § Status tones). */}
        <Badge variant="outline" className="rounded-sm text-label-caps uppercase">
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
          eighteen databases writes a hundred-odd lines. */}
      <div ref={scroller} className="max-h-64 overflow-auto rounded-md bg-steel-900 p-3">
        {events.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-mono text-label-mono text-steel-300">
              {running ? 'Waiting for the first step…' : 'No backup logs yet'}
            </p>
            <p className="mt-1 font-mono text-label-mono text-steel-400">
              Lines appear here while a backup runs
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {events.map((event) => (
              <li
                key={event.seq}
                className={cn(
                  'font-mono text-label-mono',
                  isBackupEventError(event) ? 'text-destructive' : 'text-steel-100'
                )}
              >
                {event.timestamp ? (
                  <span className="text-steel-400">
                    {new Date(event.timestamp).toLocaleTimeString()}{' '}
                  </span>
                ) : null}
                {describeBackupEvent(event)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
