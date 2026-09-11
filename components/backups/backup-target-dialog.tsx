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
import { useBackupStorageAccounts } from '@/hooks/backups/useBackupStorage';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BACKUP_CRON_PRESETS,
  DEFAULT_BACKUP_CRON,
  DEFAULT_MYSQL_PORT,
  type BackupTarget,
  type BackupTargetInput,
} from '@/types/common/backup';

// A backup target: the MySQL server, its destination, and when to run.
//
// Four things and no more: the database credentials, how long to keep dumps,
// which Azure destination to write to, and the schedule. There is no worker
// address (this app performs the dump) and no Azure key (that belongs to the
// destination, configured once for everyone).
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
  canManage,
  trigger,
}: {
  target?: BackupTarget;
  // Only an admin reaches this form at all; the prop stays so the component
  // cannot be mounted for someone who shouldn't be editing.
  canManage: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const create = useCreateBackupTarget();
  const update = useUpdateBackupTarget();
  const { data: accounts } = useBackupStorageAccounts();

  const [name, setName] = useState('');
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState(String(DEFAULT_MYSQL_PORT));
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [storageId, setStorageId] = useState('');
  const [retentionDays, setRetentionDays] = useState('7');
  const [cronSchedule, setCronSchedule] = useState<string>(DEFAULT_BACKUP_CRON);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [notes, setNotes] = useState('');

  const pending = create.isPending || update.isPending;

  // A stored schedule from before the presets existed. Kept as an option rather
  // than dropped, so editing the notes cannot change when backups run.
  const isCustomSchedule =
    Boolean(cronSchedule) &&
    !BACKUP_CRON_PRESETS.some((preset) => preset.value === cronSchedule);

  // Seeded on every open from the target being edited, so a cancelled edit does
  // not persist into the next one. The two secret fields always start empty —
  // the browser was never sent them.
  const reset = () => {
    setName(target?.name ?? '');
    setDbHost(target?.dbHost ?? '');
    setDbPort(String(target?.dbPort ?? DEFAULT_MYSQL_PORT));
    setDbUser(target?.dbUser ?? '');
    setStorageId(target?.storageId ?? '');
    setRetentionDays(String(target?.retentionDays ?? 7));
    setCronSchedule(target?.cronSchedule || DEFAULT_BACKUP_CRON);
    setScheduleEnabled(target?.scheduleEnabled ?? false);
    setNotes(target?.notes ?? '');
    setDbPassword('');
  };

  const handleSave = () => {
    const input: BackupTargetInput = {
      name,
      dbHost,
      dbPort: Number(dbPort) || DEFAULT_MYSQL_PORT,
      dbUser,
      // Null clears the destination, which the service distinguishes from
      // "unchanged" — so an unselected picker has to send null, not ''.
      storageId: storageId || null,
      retentionDays: Number(retentionDays) || 7,
      notes,
    };
    // An empty password field means "keep the stored one" — the browser was
    // never sent it, so it has nothing to send back.
    if (dbPassword.trim()) input.dbPassword = dbPassword;
    if (canManage) {
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

          {/* ---- destination -------------------------------------------- */}
          {/* Picked, not typed: the account and its key are configured once for
              everyone, under "Azure storage" on the Backups page. */}
          <div className="space-y-2">
            <Label>Azure destination</Label>
            <Select value={storageId} onValueChange={setStorageId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a destination" />
              </SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name || account.container}
                    {account.hasConnectionString ? '' : ' — no key stored'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-body-sm text-muted-foreground">
              {(accounts ?? []).length === 0
                ? 'None configured yet — add one with the Azure storage button on the Backups page.'
                : 'Dumps are written under this target’s own folder in that container.'}
            </p>
          </div>

          {/* ---- the schedule ------------------------------------------- */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-label-caps uppercase text-muted-foreground">Schedule</p>
            {canManage ? (
              <>
                <div className="space-y-2">
                  <Label>When</Label>
                  {/* Chosen, not typed. Five-field cron is easy to get subtly
                      wrong, and the cost of a wrong one is discovered a day
                      later by a backup that never happened. A value from an
                      older row that is not a preset is offered as-is, so
                      opening this form cannot silently reschedule it. */}
                  <Select value={cronSchedule} onValueChange={setCronSchedule}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      {BACKUP_CRON_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                          {preset.hint ? ` — ${preset.hint}` : ''}
                        </SelectItem>
                      ))}
                      {isCustomSchedule ? (
                        <SelectItem value={cronSchedule}>{cronSchedule} — custom</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                  <p className="font-mono text-label-mono text-muted-foreground">
                    {cronSchedule} · pg_cron
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
          <Button onClick={handleSave} disabled={pending || !dbHost.trim()}>
            {pending ? 'Saving…' : target ? 'Save changes' : 'Add target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
