// backup-dispatch — the scheduled trigger for database backups.
//
// pg_cron fires one `net.http_post` per target on that target's own cron
// expression (see `…_backup_schedule_cron.sql`); this function is what it posts
// to. Its whole job is to turn "target X is due" into "the worker for X is
// dumping", and to leave a record that it asked.
//
// ## Why the dump is not here
//
// Edge Functions get 2s of CPU time, 256MB of memory, no mysqldump binary and no
// persistent disk. One of these databases is 64MB and takes 245s of real work,
// and a run covers 18 of them — the CPU cap alone rules out building dump SQL
// and gzipping it here, and re-implementing mysqldump in Deno would trade a
// performance problem for a correctness one (views, triggers, charsets, foreign
// key ordering). So the container keeps the dumping, and Supabase keeps the
// schedule, the configuration and the secrets.
//
// ## Fire, don't wait
//
// The worker answers `POST /api/backup` only when every dump has finished, which
// is tens of minutes for a full run. Waiting would exceed the 400s wall clock and
// pin an invocation to it for no benefit — so the request is handed to
// `EdgeRuntime.waitUntil` and this function answers 202 immediately. The worker
// runs one backup at a time by design and rejects a second with 409, which is why
// a target is dispatched as a single "all databases" request rather than one
// request per database.
//
// Deploy: `supabase functions deploy backup-dispatch`
// Auth: the default `verify_jwt` applies — pg_cron sends the service-role key,
// which is a JWT, so no bespoke check is needed here. Nothing else can invoke it.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// How long to give the worker to *accept* the request. It does not answer until
// the dump is done, so this only has to cover connect + headers; the response
// itself is never read.
const DISPATCH_TIMEOUT_MS = 10_000;

interface TargetRow {
  id: string;
  name: string;
  worker_url: string;
  schedule_enabled: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  // The service-role key: this function reads the registry and writes the audit
  // row, both of which sit behind RLS the anon key cannot pass. It is injected
  // by the platform, not stored in the repo.
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Function is not configured.' }, 500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const body = (await req.json().catch(() => ({}))) as { targetId?: string };

  // A specific target when pg_cron names one (the normal path); every enabled
  // target when it does not, which is what makes a manual "dispatch everything"
  // possible without a second function.
  let query = supabase
    .from('backup_targets')
    .select('id, name, worker_url, schedule_enabled')
    .eq('schedule_enabled', true);
  if (body.targetId) query = query.eq('id', body.targetId);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const targets = (data ?? []) as TargetRow[];
  if (targets.length === 0) {
    // Not an error: a disabled target whose job has not been unscheduled yet, or
    // an id that no longer exists. Reported so a silent no-op is still visible.
    return json({ dispatched: 0, message: 'No enabled target matched.' }, 200);
  }

  const dispatched: string[] = [];

  for (const target of targets) {
    if (!target.worker_url) continue;

    // Fired without awaiting the dump. `waitUntil` keeps the invocation alive
    // long enough for the request to reach the worker; whether this function is
    // still running when the dump finishes is irrelevant, because the worker
    // completes server-side regardless of the client.
    const attempt = (async () => {
      let httpStatus = 0;
      let failure = '';
      try {
        const res = await fetch(`${target.worker_url.replace(/\/+$/, '')}/api/backup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Empty list = every database on the server, which is the worker's own
          // default and what the nightly run has always done.
          body: JSON.stringify({ databases: [] }),
          signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
        });
        httpStatus = res.status;
        // 409 is "already running" — the run we wanted is happening, so this is
        // recorded as dispatched rather than as a failure.
        if (!res.ok && res.status !== 409) failure = `HTTP ${res.status}`;
      } catch (err) {
        // A timeout here does **not** mean the backup failed: the worker holds
        // the response until the dump completes, so the expected outcome of a
        // successful dispatch is often exactly this. It is recorded as
        // dispatched, and the worker's own history is the record of the result.
        const message = err instanceof Error ? err.message : 'network error';
        const timedOut = /timeout|aborted|signal/i.test(message);
        if (!timedOut) failure = message;
      }

      await supabase.from('backup_dispatches').insert({
        target_id: target.id,
        source: 'schedule',
        status: failure ? 'failed' : 'dispatched',
        http_status: httpStatus,
        error: failure,
      });
    })();

    // @ts-expect-error — EdgeRuntime is provided by the Supabase runtime and is
    // not in the Deno type set.
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(attempt);
    dispatched.push(target.id);
  }

  return json({ dispatched: dispatched.length, targets: dispatched }, 202);
});
