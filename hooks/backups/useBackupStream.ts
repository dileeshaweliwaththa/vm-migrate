'use client';

import { useEffect, useRef, useState } from 'react';
import type { BackupLogEvent } from '@/types/common/backup';

// Subscribes to a target's live backup progress.
//
// `EventSource` rather than a poll: the worker pushes a step at a time and the
// steps are what the panel renders. Its persisted-log endpoint exists too, but it
// writes to the worker's own MySQL fire-and-forget, so on a deployment missing
// those tables it returns nothing — the stream is the channel that works.
//
// Each line is stamped with the local time on arrival, because the worker's
// payload has no timestamp (see `BackupLogEvent`).

// How many lines to keep. A full run over eighteen databases emits roughly a
// hundred; the cap is there so a stream left open for a day cannot grow without
// bound.
const MAX_LINES = 500;

export const useBackupStream = (targetId: string, enabled: boolean) => {
  const [events, setEvents] = useState<BackupLogEvent[]>([]);
  // Whether the stream itself is attached — distinct from whether a backup is
  // running, which the worker's status reports.
  const [streamOpen, setStreamOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    // No state written here: a disabled hook reports `connected: false` by
    // derivation below, which keeps this effect to the one thing it owns.
    if (!enabled || !targetId) return;

    const source = new EventSource(`/api/backups/${targetId}/stream`);

    source.onopen = () => setStreamOpen(true);

    source.onmessage = (message) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(message.data) as Record<string, unknown>;
      } catch {
        return; // not our envelope; the worker also writes heartbeat comments
      }

      // The worker's first frame is `{"type":"connected"}` — an acknowledgement,
      // not a step of a backup.
      const type = typeof payload.type === 'string' ? payload.type : '';
      if (!type || type === 'connected') return;

      seq.current += 1;
      const event: BackupLogEvent = {
        seq: seq.current,
        type,
        database: typeof payload.database === 'string' ? payload.database : '',
        index: typeof payload.index === 'number' ? payload.index : 0,
        total: typeof payload.total === 'number' ? payload.total : 0,
        size: typeof payload.size === 'number' ? payload.size : 0,
        azureUploaded: Boolean(payload.azureUploaded),
        azureError: typeof payload.azureError === 'string' ? payload.azureError : '',
        error: typeof payload.error === 'string' ? payload.error : '',
        receivedAt: new Date().toISOString(),
      };

      setEvents((prev) => {
        const next = [...prev, event];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    };

    // `EventSource` reconnects on its own, so an error is a state to show rather
    // than something to handle — and the lines already received stay put.
    source.onerror = () => setStreamOpen(false);

    return () => {
      source.close();
      setStreamOpen(false);
      // Clear on teardown, not on setup: switching to another target must not
      // inherit the previous one's lines, and doing it here keeps the effect
      // body free of state writes.
      setEvents([]);
      seq.current = 0;
    };
    // Deliberately not depending on `events`: the effect owns the subscription,
    // and re-running it on every line would reconnect once per step.
  }, [targetId, enabled]);

  // Derived rather than stored, so a disabled hook cannot report a stale
  // connection.
  return { events, connected: enabled && streamOpen };
};
