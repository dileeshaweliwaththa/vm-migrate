'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Cloud, KeyRound, PlugZap, Plus, Trash2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  useBackupStorageAccounts,
  useCreateBackupStorage,
  useDeleteBackupStorage,
  useTestBackupStorage,
  useUpdateBackupStorage,
} from '@/hooks/backups/useBackupStorage';
import type { BackupStorageAccount } from '@/types/common/backup';

// Azure storage, managed once for every target.
//
// It lives behind its own button on the Backups page rather than inside the
// target form because it *is* shared: the same account and the same key served
// every database server, and asking for them per target meant entering the key
// again and rotating it in several places. A target now picks one from a list.
//
// The connection string is write-only, like every other credential here: the
// payload says whether one is stored, never what it is, and a blank field on save
// means "keep it".

function StorageForm({
  account,
  onDone,
}: {
  account?: BackupStorageAccount;
  onDone: () => void;
}) {
  const create = useCreateBackupStorage();
  const update = useUpdateBackupStorage();

  const [name, setName] = useState(account?.name ?? '');
  const [accountName, setAccountName] = useState(account?.accountName ?? '');
  const [container, setContainer] = useState(account?.container ?? '');
  const [connectionString, setConnectionString] = useState('');
  const [notes, setNotes] = useState(account?.notes ?? '');

  const pending = create.isPending || update.isPending;

  const handleSave = () => {
    const input = {
      name,
      accountName,
      container,
      notes,
      ...(connectionString.trim() ? { connectionString } : {}),
    };

    const done = (message: string) => {
      toast.success(message);
      onDone();
    };
    const fail = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : 'Something went wrong.');

    if (account) {
      update.mutate(
        { id: account.id, input },
        { onSuccess: () => done('Storage updated.'), onError: fail }
      );
    } else {
      create.mutate(input, { onSuccess: () => done('Storage added.'), onError: fail });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-label-caps uppercase text-muted-foreground">
        {account ? 'Edit destination' : 'New destination'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="st-name">Name</Label>
          <Input
            id="st-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="UPVIEW backups"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="st-account">Storage account</Label>
          <Input
            id="st-account"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="upviewtechnologies"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="st-container">Container</Label>
        <Input
          id="st-container"
          value={container}
          onChange={(e) => setContainer(e.target.value)}
          placeholder="mysql-backups"
        />
        {/* Created on the first upload if it isn't there, so a typo shows up as a
            new empty container rather than as an error. */}
        <p className="text-body-sm text-muted-foreground">
          Created automatically on the first backup if it doesn&apos;t exist yet.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="st-conn">Connection string</Label>
          {account?.hasConnectionString ? (
            <Badge variant="outline" className="rounded-sm text-label-caps uppercase">
              <KeyRound className="size-3" /> Stored
            </Badge>
          ) : null}
        </div>
        <Textarea
          id="st-conn"
          value={connectionString}
          onChange={(e) => setConnectionString(e.target.value)}
          placeholder={
            account?.hasConnectionString
              ? 'Leave blank to keep the stored connection string'
              : 'DefaultEndpointsProtocol=https;AccountName=…'
          }
          rows={2}
          // Content-sized by default (`field-sizing-content`), which a long
          // connection string would use to stretch the dialog.
          className="field-sizing-fixed w-full min-w-0"
        />
        <p className="text-body-sm text-muted-foreground">
          Contains the account key — stored server-side only, never sent back to the browser.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="st-notes">Notes</Label>
        <Input id="st-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={pending || !container.trim()}>
          {pending ? 'Saving…' : account ? 'Save changes' : 'Add destination'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function StorageRow({
  account,
  canManage,
  onEdit,
}: {
  account: BackupStorageAccount;
  canManage: boolean;
  onEdit: () => void;
}) {
  const test = useTestBackupStorage();
  const remove = useDeleteBackupStorage();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{account.name || account.container}</p>
          <p className="truncate font-mono text-label-mono text-muted-foreground">
            {account.accountName ? `${account.accountName}/` : ''}
            {account.container}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {account.hasConnectionString ? (
            <Badge variant="outline" className="rounded-sm text-label-caps uppercase">
              <KeyRound className="size-3" /> Key stored
            </Badge>
          ) : (
            // Without a key it is a name, not a destination — and a target
            // pointing at it cannot back anything up.
            <Badge
              variant="outline"
              className="rounded-sm bg-tone-warning text-label-caps uppercase text-tone-warning-fg"
            >
              No key
            </Badge>
          )}
          {canManage ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={test.isPending}
                onClick={() =>
                  test.mutate(account.id, {
                    onSuccess: setResult,
                    onError: (error) =>
                      setResult({
                        ok: false,
                        message: error instanceof Error ? error.message : 'Could not test.',
                      }),
                  })
                }
              >
                <PlugZap className="size-4" />
                {test.isPending ? 'Testing…' : 'Test'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                Edit
              </Button>
            </>
          ) : null}
          {canManage ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Remove ${account.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove “{account.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Any target pointing at it is left without a destination and cannot back up
                    until another is chosen. <strong>No dump is deleted</strong> — the blobs stay
                    in Azure.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      remove.mutate(account.id, {
                        onSuccess: () => toast.success('Storage removed.'),
                        onError: (error) =>
                          toast.error(
                            error instanceof Error ? error.message : 'Failed to remove.'
                          ),
                      })
                    }
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      {result ? (
        <p
          className={cn(
            'flex items-start gap-1.5 rounded-md px-3 py-2 text-body-sm',
            result.ok
              ? 'bg-tone-success text-tone-success-fg'
              : 'bg-tone-danger text-tone-danger-fg'
          )}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          )}
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

export function BackupStorageDialog({
  canManage,
  trigger,
}: {
  canManage: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackupStorageAccount | null>(null);
  const [adding, setAdding] = useState(false);
  const { data: accounts, isLoading } = useBackupStorageAccounts();

  const close = () => {
    setEditing(null);
    setAdding(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) close();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Azure storage</DialogTitle>
          <DialogDescription>
            Where dumps are written. One destination is shared by every target that points at it,
            so the account key is entered once.
          </DialogDescription>
        </DialogHeader>

        {/* The list scrolls, not the dialog — `overflow-y-auto` on
            `DialogContent` also turns on horizontal scrolling and drags the
            close button away with it (docs/ui-guidelines.md). */}
        <div className="max-h-[60vh] min-w-0 space-y-3 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="py-6 text-center text-body-sm text-muted-foreground">Loading…</p>
          ) : (accounts ?? []).length === 0 && !adding ? (
            <p className="rounded-lg border border-dashed border-border py-8 text-center text-body-sm text-muted-foreground">
              No destinations yet.
            </p>
          ) : (
            (accounts ?? []).map((account) =>
              editing?.id === account.id ? (
                <StorageForm key={account.id} account={account} onDone={close} />
              ) : (
                <StorageRow
                  key={account.id}
                  account={account}
                  canManage={canManage}
                  onEdit={() => {
                    setAdding(false);
                    setEditing(account);
                  }}
                />
              )
            )
          )}

          {adding ? <StorageForm onDone={close} /> : null}
        </div>

        <DialogFooter className="sm:justify-between">
          {canManage && !adding && !editing ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setAdding(true);
              }}
            >
              <Cloud className="size-4" />
              <Plus className="size-4" /> Add destination
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
