'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCreateBackupTarget, useUpdateBackupTarget } from '@/hooks/backups/useBackups';
import { DEFAULT_MYSQL_PORT, type BackupTarget, type BackupTargetInput } from '@/types/common/backup';

// A backup target: the MySQL server, where its dumps go, when, and which worker
// does the dumping.
//
// The two credentials are **write-only**. They are stored in a table no client
// can read, the payload behind this form says only whether one is stored, and a
// blank field on save means "keep the stored one" — so a password cannot be
// disclosed by opening this dialog, and cannot be wiped by not retyping it.
//
// The schedule fields are admin-only, which the service enforces: their presence
// in the payload is what raises the bar there.
export function BackupTargetDialog({
  target,
  canAdmin,
  // An existing target's worker address, used as the default for a new one. One
  // container normally dumps every database, so the second target should not
  // have to be told where it lives again.
  defaultWorkerUrl = '',
  trigger,
}: {
  target?: BackupTarget;
  // Whether to offer the schedule at all. An editor sees the rest.
  canAdmin: boolean;
  defaultWorkerUrl?: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const create = useCreateBackupTarget();
  const update = useUpdateBackupTarget();

  const [name, setName] = useState('');
  const [workerUrl, setWorkerUrl] = useState('');
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState(String(DEFAULT_MYSQL_PORT));
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [azureAccount, setAzureAccount] = useState('');
  const [azureContainer, setAzureContainer] = useState('');
  const [azureConnectionString, setAzureConnectionString] = useState('');
  const [retentionDays, setRetentionDays] = useState('7');
  const [cronSchedule, setCronSchedule] = useState('0 2 * * *');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [notes, setNotes] = useState('');

  const pending = create.isPending || update.isPending;

  // Seeded on every open from the target being edited, so a cancelled edit does
  // not persist into the next one. The two secret fields always start empty —
  // the browser was never sent them.
  const reset = () => {
    setName(target?.name ?? '');
    setWorkerUrl(target?.workerUrl ?? defaultWorkerUrl);
    setDbHost(target?.dbHost ?? '');
    setDbPort(String(target?.dbPort ?? DEFAULT_MYSQL_PORT));
    setDbUser(target?.dbUser ?? '');
    setAzureAccount(target?.azureAccount ?? '');
    setAzureContainer(target?.azureContainer ?? '');
    setRetentionDays(String(target?.retentionDays ?? 7));
    setCronSchedule(target?.cronSchedule ?? '0 2 * * *');
    setScheduleEnabled(target?.scheduleEnabled ?? false);
    setNotes(target?.notes ?? '');
    setDbPassword('');
    setAzureConnectionString('');
  };

  const handleSave = () => {
    const input: BackupTargetInput = {
      name,
      workerUrl,
      dbHost,
      dbPort: Number(dbPort) || DEFAULT_MYSQL_PORT,
      dbUser,
      azureAccount,
      azureContainer,
      retentionDays: Number(retentionDays) || 7,
      notes,
    };
    // Only sent when there is something to send: an empty field means "keep the
    // stored credential", and the schedule is left out entirely for a
    // non-admin so the service doesn't refuse an edit they were allowed to make.
    if (dbPassword.trim()) input.dbPassword = dbPassword;
    if (azureConnectionString.trim()) input.azureConnectionString = azureConnectionString;
    if (canAdmin) {
      input.cronSchedule = cronSchedule;
      input.scheduleEnabled = scheduleEnabled;
    }

    const done = (message: string) => {
      toast.success(message);
      setOpen(false);
    };
    const fail = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : 'Something went wrong.');

    if (target) {
      update.mutate(
        { id: target.id, input },
        { onSuccess: () => done('Backup target updated.'), onError: fail }
      );
    } else {
      create.mutate(input, { onSuccess: () => done('Backup target added.'), onError: fail });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* `sm:max-w-lg`, matching the breakpoint the primitive sets its own
          `sm:max-w-sm` at — an unprefixed `max-w-*` is silently ignored above
          640px (docs/ui-guidelines.md).

          The **fields** scroll, not the dialog. `overflow-y-auto` on
          `DialogContent` also enables horizontal scrolling (per CSS, one axis
          non-visible makes the other `auto`), which drags the absolutely
          positioned close button off with it — and it scrolled the title out of
          view, which is what made this form look headless. `min-w-0` because
          `DialogContent` is a grid and its children otherwise refuse to shrink
          below their content. */}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target ? 'Edit backup target' : 'Add backup target'}</DialogTitle>
          <DialogDescription>
            A MySQL server, its Azure destination and its schedule. Credentials are stored
            server-side and never sent back to the browser.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] min-w-0 space-y-5 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="bt-name">Name</Label>
            <Input
              id="bt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mencartdb (Azure MySQL)"
              autoFocus
            />
          </div>

          {/* ---- the database ------------------------------------------- */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-label-caps uppercase text-muted-foreground">Database</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="bt-db-host">Host</Label>
                <Input
                  id="bt-db-host"
                  value={dbHost}
                  onChange={(e) => setDbHost(e.target.value)}
                  placeholder="mencartdb.mysql.database.azure.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bt-db-port">Port</Label>
                <Input
                  id="bt-db-port"
                  value={dbPort}
                  onChange={(e) => setDbPort(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bt-db-user">User</Label>
              <Input
                id="bt-db-user"
                value={dbUser}
                onChange={(e) => setDbUser(e.target.value)}
                placeholder="admin_user"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="bt-db-password">Password</Label>
                {target?.hasDbPassword ? (
                  <Badge variant="outline" className="rounded-sm text-label-caps uppercase">
                    <KeyRound className="size-3" /> Stored
                  </Badge>
                ) : null}
              </div>
              <Input
                id="bt-db-password"
                type="password"
                value={dbPassword}
                onChange={(e) => setDbPassword(e.target.value)}
                placeholder={target?.hasDbPassword ? 'Leave blank to keep the stored password' : ''}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bt-retention">Keep dumps for (days)</Label>
              <Input
                id="bt-retention"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          {/* ---- Azure -------------------------------------------------- */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-label-caps uppercase text-muted-foreground">Azure Blob Storage</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bt-azure-account">Account</Label>
                <Input
                  id="bt-azure-account"
                  value={azureAccount}
                  onChange={(e) => setAzureAccount(e.target.value)}
                  placeholder="upviewtechnologies"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bt-azure-container">Container</Label>
                <Input
                  id="bt-azure-container"
                  value={azureContainer}
                  onChange={(e) => setAzureContainer(e.target.value)}
                  placeholder="mysql-backups"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="bt-azure-conn">Connection string</Label>
                {target?.hasAzureConnection ? (
                  <Badge variant="outline" className="rounded-sm text-label-caps uppercase">
                    <KeyRound className="size-3" /> Stored
                  </Badge>
                ) : null}
              </div>
              <Textarea
                id="bt-azure-conn"
                value={azureConnectionString}
                onChange={(e) => setAzureConnectionString(e.target.value)}
                placeholder={
                  target?.hasAzureConnection
                    ? 'Leave blank to keep the stored connection string'
                    : 'DefaultEndpointsProtocol=https;AccountName=…'
                }
                rows={2}
                // Content-sized by default (`field-sizing-content`), which a long
                // connection string would use to stretch the dialog.
                className="field-sizing-fixed w-full min-w-0"
              />
              <p className="text-body-sm text-muted-foreground">
                Contains the account key — stored server-side only.
              </p>
            </div>
          </div>

          {/* ---- worker + schedule -------------------------------------- */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-label-caps uppercase text-muted-foreground">Worker &amp; schedule</p>
            <div className="space-y-2">
              <Label htmlFor="bt-worker">Backup worker</Label>
              <Input
                id="bt-worker"
                value={workerUrl}
                onChange={(e) => setWorkerUrl(e.target.value)}
                placeholder={defaultWorkerUrl || '20.197.41.68'}
              />
              {/* This field asks for something people reasonably query, so it
                  says what it is for rather than just what to type: the portal
                  cannot dump a database itself, and this is the machine that
                  can. It is not the database's address — that is above. */}
              <p className="text-body-sm text-muted-foreground">
                Where the MySQL Backup Manager container runs — it is what performs the dump and
                the upload, and what this page reads status, history and live logs from. Host only
                is enough: <code className="font-mono">http://</code> and{' '}
                <code className="font-mono">:2999</code> are filled in.
                {defaultWorkerUrl && !target ? ' Prefilled from your existing target.' : ''}
              </p>
            </div>

            {canAdmin ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="bt-cron">Schedule (cron)</Label>
                  <Input
                    id="bt-cron"
                    value={cronSchedule}
                    onChange={(e) => setCronSchedule(e.target.value)}
                    placeholder="0 2 * * *"
                    className="font-mono"
                  />
                  <p className="text-body-sm text-muted-foreground">
                    Five fields, run by Postgres (pg_cron) — not by the worker.{' '}
                    <code className="font-mono">0 2 * * *</code> is daily at 02:00.
                  </p>
                </div>
                {/* `Toggle`, not `Switch`: the generated switch styles on Radix
                    2.x boolean data attributes this project's 1.4.3 never emits
                    and renders invisible (docs/ui-guidelines.md). */}
                <Toggle
                  variant="outline"
                  size="sm"
                  pressed={scheduleEnabled}
                  onPressedChange={setScheduleEnabled}
                  aria-label="Run on this schedule"
                >
                  {scheduleEnabled ? 'Schedule on' : 'Schedule off'}
                </Toggle>
              </>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bt-notes">Notes</Label>
            <Textarea
              id="bt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending || !workerUrl.trim()}>
            {pending ? 'Saving…' : target ? 'Save changes' : 'Add target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
