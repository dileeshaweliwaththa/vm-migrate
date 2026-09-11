'use client';

import { useState } from 'react';
import { CheckCircle2, CircleAlert, PlugZap, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STATUS_PILL_CLASS, STATUS_TONE_CLASS } from '@/lib/vm-utils';
import { describeCron } from '@/lib/backup-utils';
import { useTestBackupSchedule } from '@/hooks/backups/useBackups';
import type { BackupCheckState, BackupScheduleTest, BackupTarget } from '@/types/common/backup';

// The schedule, and a button that proves it works.
//
// Everything a scheduled backup depends on lives outside this app — a pg_cron
// job, two Vault secrets, and an HTTP call out of Supabase — so until now the
// only way to find out whether it worked was to wait until 02:00 and see. The
// button asks Postgres directly and then sends one request down the same path a
// firing job takes, which `/api/backups/cron` answers without dumping anything.
//
// Admin-only, like everything else that acts on this tab. A viewer sees the
// schedule as a label and no button, which is the honest rendering: there is
// nothing for them to press.

// The icon carries the verdict in colour; the pill shapes are reserved for the
// schedule itself, so a row of five pills doesn't read as five statuses.
const CHECK_ICON_CLASS: Record<BackupCheckState, string> = {
  pass: 'text-tone-success-fg',
  warn: 'text-tone-warning-fg',
  fail: 'text-tone-danger-fg',
};

const CHECK_ICON: Record<BackupCheckState, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: CircleAlert,
  fail: XCircle,
};

function CheckRow({ check }: { check: BackupScheduleTest['checks'][number] }) {
  const Icon = CHECK_ICON[check.state];
  return (
    <div className="grid grid-cols-[auto_10rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-1.5">
      <Icon className={cn('mt-0.5 size-4 shrink-0', CHECK_ICON_CLASS[check.state])} />
      <span className="text-label-caps uppercase text-muted-foreground">{check.label}</span>
      {/* `break-words`: a detail can carry a URL, and a long one must wrap
          rather than widen the panel. */}
      <span className="break-words text-body-sm">{check.detail}</span>
    </div>
  );
}

export function BackupScheduleTestPanel({
  target,
  canManage,
}: {
  target: BackupTarget;
  canManage: boolean;
}) {
  const test = useTestBackupSchedule();
  const [result, setResult] = useState<BackupScheduleTest | null>(null);
  const [error, setError] = useState('');

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-label-caps uppercase text-muted-foreground">Schedule</p>
          <span
            className={cn(
              STATUS_PILL_CLASS,
              STATUS_TONE_CLASS[target.scheduleEnabled ? 'success' : 'warning']
            )}
          >
            {target.scheduleEnabled ? describeCron(target.cronSchedule) : 'Off'}
          </span>
          {/* The testing preset left on is worth saying out loud — it dumps
              every database twelve times an hour. */}
          {target.scheduleEnabled && target.cronSchedule.trim() === '*/5 * * * *' ? (
            <span className={cn(STATUS_PILL_CLASS, STATUS_TONE_CLASS.warning)}>Testing only</span>
          ) : null}
        </div>

        {canManage ? (
          <Button
            size="sm"
            variant="outline"
            disabled={test.isPending}
            onClick={() => {
              setError('');
              test.mutate(target.id, {
                onSuccess: (data) => {
                  setResult(data);
                  setError('');
                },
                onError: (err) => {
                  setResult(null);
                  setError(err instanceof Error ? err.message : 'Could not test the schedule.');
                },
              });
            }}
          >
            <PlugZap className="mr-2 size-4" />
            {test.isPending ? 'Testing…' : 'Test schedule'}
          </Button>
        ) : null}
      </div>

      {test.isPending ? (
        <p className="text-body-sm text-muted-foreground">
          Asking Supabase to call this app… the response comes back through pg_net, so this takes a
          few seconds.
        </p>
      ) : error ? (
        <p className="rounded-md bg-tone-danger px-3 py-2 text-body-sm text-tone-danger-fg">
          {error}
        </p>
      ) : result ? (
        <div className="space-y-2">
          <p
            className={cn(
              'rounded-md px-3 py-2 text-body-sm',
              result.ok
                ? 'bg-tone-success text-tone-success-fg'
                : 'bg-tone-danger text-tone-danger-fg'
            )}
          >
            {result.summary}
          </p>
          <div className="divide-y divide-border">
            {result.checks.map((check) => (
              <CheckRow key={check.label} check={check} />
            ))}
          </div>
        </div>
      ) : canManage ? (
        <p className="text-body-sm text-muted-foreground">
          Checks the pg_cron job and its secrets, then has Supabase send one real request to this
          app. No dump is taken.
        </p>
      ) : null}
    </div>
  );
}
