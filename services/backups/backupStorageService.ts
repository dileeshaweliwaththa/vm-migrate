import {
  deleteStorageAccount as deleteStorageAccountRow,
  findAllStorageAccounts,
  findStorageAccountById,
  findStorageIdsWithSecret,
  getStorageConnectionString,
  insertStorageAccount,
  setStorageConnectionString,
  updateStorageAccount as updateStorageAccountRow,
  type BackupStorageAccountRow,
  type BackupStorageWriteColumns,
} from '@/repositories/backupStorage/backupStorageRepository';
import { listBlobs } from '@/repositories/azure/azureBlobRepository';
import { getCurrentRole } from '@/services/auth/authService';
import { canEdit, isAdmin } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import type { BackupStorageAccount, BackupStorageInput } from '@/types/common/backup';

// Service layer: the Azure destinations backups are written to.
//
// One account, shared by every target — so the key is entered once and rotated
// once. Its own service rather than part of `backupService` because it is its own
// entity with its own routes and its own lifetime: a storage account outlives the
// targets that point at it.

const requireEditor = async (action: string): Promise<void> => {
  if (!canEdit(await getCurrentRole())) {
    throw new ForbiddenError(`Editor access required to ${action}.`);
  }
};

const requireAdmin = async (action: string): Promise<void> => {
  if (!isAdmin(await getCurrentRole())) {
    throw new ForbiddenError(`Admin access required to ${action}.`);
  }
};

const rowToAccount = (
  row: BackupStorageAccountRow,
  hasConnectionString: boolean
): BackupStorageAccount => ({
  id: row.id,
  name: row.name,
  accountName: row.account_name,
  container: row.container,
  notes: row.notes,
  hasConnectionString,
});

const inputToColumns = (input: BackupStorageInput): BackupStorageWriteColumns => {
  const cols: BackupStorageWriteColumns = {};
  if (input.name !== undefined) cols.name = input.name.trim();
  if (input.accountName !== undefined) cols.account_name = input.accountName.trim();
  if (input.container !== undefined) cols.container = input.container.trim();
  if (input.notes !== undefined) cols.notes = input.notes;
  return cols;
};

export const listStorageAccounts = async (): Promise<BackupStorageAccount[]> => {
  const rows = await findAllStorageAccounts();
  const withSecret = new Set(await findStorageIdsWithSecret(rows.map((row) => row.id)));
  return rows.map((row) => rowToAccount(row, withSecret.has(row.id)));
};

export const createStorageAccount = async (
  input: BackupStorageInput
): Promise<BackupStorageAccount> => {
  await requireEditor('add an Azure storage account');

  const cols = inputToColumns(input);
  if (!cols.container) throw new Error('A container name is required.');
  // Named after the account when no name is given, so the picker is never a list
  // of blanks.
  if (!cols.name) cols.name = cols.account_name || cols.container;

  const row = await insertStorageAccount(cols);
  if (input.connectionString) await setStorageConnectionString(row.id, input.connectionString);

  const withSecret = new Set(await findStorageIdsWithSecret([row.id]));
  return rowToAccount(row, withSecret.has(row.id));
};

export const updateStorageAccount = async (
  id: string,
  input: BackupStorageInput
): Promise<BackupStorageAccount> => {
  await requireEditor('edit an Azure storage account');

  const cols = inputToColumns(input);
  if (cols.container !== undefined && !cols.container) {
    throw new Error('A container name is required.');
  }

  const row = await updateStorageAccountRow(id, cols);
  // Blank means "keep the stored one" — the form was never given it to resend.
  if (input.connectionString?.trim()) {
    await setStorageConnectionString(id, input.connectionString);
  }

  const withSecret = new Set(await findStorageIdsWithSecret([id]));
  return rowToAccount(row, withSecret.has(id));
};

// Removing a destination leaves the targets that pointed at it without one (the
// FK is `on delete set null`) and **does not touch the blobs**. Admin-only: it
// is how a set of databases quietly stops having anywhere to be backed up.
export const deleteStorageAccount = async (id: string): Promise<void> => {
  await requireAdmin('remove an Azure storage account');
  await deleteStorageAccountRow(id);
};

// Server-internal: what the runner needs to write a blob. Never routed to a
// client.
export const getStorageForWrite = async (
  id: string | null
): Promise<
  { ok: true; connectionString: string; container: string } | { ok: false; message: string }
> => {
  if (!id) return { ok: false, message: 'This target has no Azure destination selected.' };

  const row = await findStorageAccountById(id);
  if (!row) return { ok: false, message: 'The selected Azure destination no longer exists.' };
  if (!row.container.trim()) {
    return { ok: false, message: 'That Azure destination has no container set.' };
  }

  const connectionString = await getStorageConnectionString(id);
  if (!connectionString) {
    return {
      ok: false,
      message: 'No connection string is stored for that Azure destination.',
    };
  }

  return { ok: true, connectionString, container: row.container.trim() };
};

// Does the account actually work? Listing a container is the cheapest
// authenticated call Azure answers, and it is the same call retention makes — so
// a pass here means a backup has somewhere to go.
export const testStorageAccount = async (
  id: string
): Promise<{ ok: boolean; message: string }> => {
  await requireEditor('test an Azure storage account');

  const storage = await getStorageForWrite(id);
  if (!storage.ok) return { ok: false, message: storage.message };

  try {
    const blobs = await listBlobs(storage.connectionString, storage.container);
    return {
      ok: true,
      message: `Connected to ${storage.container} — ${blobs.length} blob(s) present.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Azure rejected the connection.',
    };
  }
};
