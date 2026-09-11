import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runBackup } from '@/services/backups/backupService';
import { listBackupTargets } from '@/services/backups/backupService';

// POST /api/backups/cron — the scheduled entry point, called by **pg_cron**.
//
// This is the only route in the app authenticated by a shared token rather than
// a session: pg_cron has no user to be. The token lives in Supabase Vault and is
// read inside the cron job's command, so rotating it is one SQL statement and it
// never appears in a job definition. See docs/backups.md § Scheduling.
//
// Body: `{ targetId }` for one target, or nothing for every target whose
// schedule is on. It answers as soon as the runs have *started* — a dump takes
// minutes, and pg_net's HTTP call is not going to wait for it.
//
// `{ test: true }` is a handshake: it authenticates and answers, and starts
// nothing. That is what the **Test schedule** button sends down this path, so
// proving the schedule works does not cost nineteen dumps.

const authorized = (request: Request): boolean => {
  const expected = process.env.BACKUP_CRON_SECRET ?? '';
  // No secret configured means no scheduled backups, rather than an open
  // endpoint that anyone who finds the URL can trigger.
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
  if (provided.length !== expected.length) return false;

  // Constant-time: this is a bearer token on an unauthenticated route, so a
  // length-and-prefix oracle is worth avoiding even here.
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
};

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      targetId?: unknown;
      test?: unknown;
    };

    // Checked after authorization, so the handshake proves the token as well as
    // the reachability — an unauthenticated caller has already been turned away.
    if (body.test === true) {
      return NextResponse.json({ data: { test: true, accepted: true } });
    }

    const targetId = typeof body.targetId === 'string' ? body.targetId : '';

    // A single target when pg_cron names one (the normal path); every enabled
    // target when it does not, which makes a catch-all job possible.
    const targets = targetId
      ? [targetId]
      : (await listBackupTargets())
          .filter((target) => target.scheduleEnabled)
          .map((target) => target.id);

    const started: { targetId: string; ok: boolean; message: string }[] = [];
    for (const id of targets) {
      // `source: 'schedule'` — no session to check a role against, and the
      // dispatch row records that nobody asked for it.
      const result = await runBackup(id, [], 'schedule');
      started.push({ targetId: id, ...result });
    }

    return NextResponse.json({ data: { started } }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start the scheduled backup.' },
      { status: 500 }
    );
  }
}
