import {
  findBackupCronDiagnostics,
  findBackupCronPingResult,
  sendBackupCronPing,
  type BackupCronPingResult,
} from '@/repositories/backupCron/backupCronRepository';
import { getCurrentRole } from '@/services/auth/authService';
import { describeCron } from '@/lib/backup-utils';
import { isAdmin } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import type { BackupScheduleCheck, BackupScheduleTest } from '@/types/common/backup';

// Service layer: does the schedule actually work?
//
// A scheduled backup runs through four things this app cannot observe — a
// pg_cron job, two Vault secrets, an outbound HTTP call from Supabase, and the
// token check on `/api/backups/cron`. Any one of them can be wrong, and the
// symptom is identical in every case: nothing happens, and the page says
// *never dispatched*.
//
// So this module checks each link by name and sends one real request down the
// path. The request carries `{"test": true}`, which that route answers without
// starting a dump — the point is to prove the call arrives and is accepted, not
// to back up nineteen databases.
//
// Admin-only, like the schedule itself: it reads the Vault configuration and
// makes the database send an HTTP request.

const requireAdmin = async (action: string): Promise<void> => {
  if (!isAdmin(await getCurrentRole())) {
    throw new ForbiddenError(`Admin access required to ${action}.`);
  }
};

// pg_net hands the request to a background worker and returns immediately, so
// the response has to be waited for. The job command allows the call 10s; this
// allows a little more, then reports "no answer" as the finding it is.
const PING_TIMEOUT_MS = 15_000;
const PING_POLL_MS = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pingUntilSettled = async (): Promise<BackupCronPingResult> => {
  const requestId = await sendBackupCronPing();
  const deadline = Date.now() + PING_TIMEOUT_MS;

  let result = await findBackupCronPingResult(requestId);
  while (!result.settled && Date.now() < deadline) {
    await sleep(PING_POLL_MS);
    result = await findBackupCronPingResult(requestId);
  }
  return result;
};

// Turns one pg_net response into a verdict. Each branch names the thing to fix,
// because "it failed" is what the user already knew before pressing the button.
const checkPing = (result: BackupCronPingResult, url: string): BackupScheduleCheck => {
  const label = 'Supabase → this app';

  if (!result.settled) {
    return {
      label,
      state: 'fail',
      detail: `No response after ${PING_TIMEOUT_MS / 1000}s. Supabase is still trying to reach ${url}.`,
    };
  }
  if (result.timedOut) {
    return { label, state: 'fail', detail: `The request to ${url} timed out.` };
  }
  if (result.error) {
    return { label, state: 'fail', detail: `${url} — ${result.error}` };
  }
  if (result.status === 401) {
    return {
      label,
      state: 'fail',
      detail:
        'The app rejected the token (401). BACKUP_CRON_SECRET in the app’s environment and the backup_cron_secret Vault secret are not the same value.',
    };
  }
  if (result.status === 404) {
    return {
      label,
      state: 'fail',
      detail: `Nothing is served at ${url} (404) — check the backup_cron_url secret.`,
    };
  }
  if (result.status < 200 || result.status >= 300) {
    return {
      label,
      state: 'fail',
      detail: `${url} answered ${result.status}. ${result.body}`.trim(),
    };
  }
  return {
    label,
    state: 'pass',
    detail: `The app accepted the request (${result.status}) from ${url}.`,
  };
};

export const testBackupSchedule = async (targetId: string): Promise<BackupScheduleTest> => {
  await requireAdmin('test the backup schedule');

  const diagnostics = await findBackupCronDiagnostics(targetId);
  const checks: BackupScheduleCheck[] = [];

  // ---- the two secrets the job command reads at firing time ----------------
  const secretsOk = diagnostics.hasUrlSecret && diagnostics.hasTokenSecret;
  const missing = [
    !diagnostics.hasUrlSecret ? 'backup_cron_url' : '',
    !diagnostics.hasTokenSecret ? 'backup_cron_secret' : '',
  ].filter(Boolean);

  checks.push({
    label: 'Vault secrets',
    state: secretsOk ? 'pass' : 'fail',
    detail: secretsOk
      ? `Both set. The job posts to ${diagnostics.cronUrl}.`
      : `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set in Supabase Vault — see docs/backups.md § Scheduling.`,
  });

  // ---- the job itself ------------------------------------------------------
  if (!diagnostics.scheduleEnabled) {
    checks.push({
      label: 'Cron job',
      state: diagnostics.jobExists ? 'fail' : 'warn',
      detail: diagnostics.jobExists
        ? `The schedule is off, but ${diagnostics.jobName} is still registered and will keep firing. Re-save the target to clear it.`
        : 'None, because this target’s schedule is off. That is what the toggle means — turn it on under Edit to back up unattended.',
    });
  } else if (!diagnostics.jobExists) {
    checks.push({
      label: 'Cron job',
      state: 'fail',
      detail: `The schedule is on, but pg_cron has no job called ${diagnostics.jobName}. Run the migrations (supabase db push), then re-save the target.`,
    });
  } else {
    // The column and the registered job can disagree: the trigger keeps them in
    // step, so a mismatch means a sync failed and the old schedule is what runs.
    const drifted = diagnostics.jobSchedule.trim() !== diagnostics.rowSchedule.trim();
    checks.push({
      label: 'Cron job',
      state: !diagnostics.jobActive ? 'fail' : drifted ? 'warn' : 'pass',
      detail: !diagnostics.jobActive
        ? `${diagnostics.jobName} is registered but inactive, so it never fires.`
        : drifted
          ? `Registered as "${diagnostics.jobSchedule}", but this target is set to "${diagnostics.rowSchedule}". The registered one is what runs — re-save the target to sync it.`
          : `${describeCron(diagnostics.jobSchedule)} — ${diagnostics.jobSchedule}.`,
    });
  }

  // ---- how the last real firing went --------------------------------------
  if (diagnostics.lastRunStatus) {
    const failed = diagnostics.lastRunStatus === 'failed';
    checks.push({
      label: 'Last firing',
      state: failed ? 'fail' : 'pass',
      detail: `${diagnostics.lastRunStatus}${diagnostics.lastRunAt ? ` at ${diagnostics.lastRunAt}` : ''}${
        diagnostics.lastRunMessage ? ` — ${diagnostics.lastRunMessage}` : ''
      }`,
    });
  }

  // ---- the call, for real -------------------------------------------------
  // Skipped when a secret is missing: `backup_cron_ping` would raise, and the
  // check above has already said which one and why.
  if (secretsOk) {
    checks.push(checkPing(await pingUntilSettled(), diagnostics.cronUrl));
  }

  const failures = checks.filter((check) => check.state === 'fail');
  const warnings = checks.filter((check) => check.state === 'warn');

  return {
    ok: failures.length === 0,
    summary:
      failures.length > 0
        ? `${failures.length} problem${failures.length > 1 ? 's' : ''} — the schedule will not back this target up.`
        : warnings.length > 0
          ? 'The path from Supabase to this app works. One thing to note below.'
          : 'Working. Supabase reached this app and the job is registered.',
    checks,
  };
};
