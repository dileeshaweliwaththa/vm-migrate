import {
  findAllVmGroups,
  insertVmGroup,
  updateVmGroup as updateVmGroupRow,
  deleteVmGroup as deleteVmGroupRow,
  type VmGroupWriteColumns,
} from '@/repositories/vmGroups/vmGroupRepository';
import { setVmsGroup } from '@/repositories/vms/vmRepository';
import { getCurrentRole } from '@/services/auth/authService';
import { canEdit } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import type { VmGroupRow } from '@/types/supabase/response/vmGroups';
import type { VmGroup, VmGroupInput } from '@/types/common/vm';

// Service layer: business logic for VM groups — the named parents the tracker
// renders its rows under (one group, many VMs). Lives beside `vmService` rather
// than inside it because groups are their own entity with their own table and
// routes; `vmService` owns the payload that carries them to the client.
//
// Authorization mirrors the rest of the tracker: reading is open to every
// signed-in role, writing needs editor+. Role-based RLS on `vm_groups` enforces
// the same split in Postgres and is authoritative — these checks exist so a
// denied action fails as a clean 403 rather than a raw policy violation.

const requireEditor = async (action: string): Promise<void> => {
  if (!canEdit(await getCurrentRole())) {
    throw new ForbiddenError(`Editor access required to ${action}.`);
  }
};

export const rowToVmGroup = (row: VmGroupRow): VmGroup => ({
  id: row.id,
  name: row.name,
  notes: row.notes ?? '',
});

const groupInputToColumns = (input: VmGroupInput): VmGroupWriteColumns => {
  const cols: VmGroupWriteColumns = {};
  if (input.name !== undefined) cols.name = input.name.trim();
  if (input.notes !== undefined) cols.notes = input.notes;
  return cols;
};

// `name` is unique in the DB, so a second "EUKHOST" comes back as a constraint
// violation. Translated here because the raw message names the index, and the
// user's actual mistake — that group already exists — is worth saying plainly.
const isDuplicateName = (error: unknown): boolean =>
  error instanceof Error && /duplicate key|unique/i.test(error.message);

export const listVmGroups = async (): Promise<VmGroup[]> =>
  (await findAllVmGroups()).map(rowToVmGroup);

export const createVmGroup = async (input: VmGroupInput): Promise<VmGroup> => {
  await requireEditor('create a VM group');

  const name = input.name?.trim();
  // A group is nothing but its name — an unnamed one would render as an
  // anonymous header no one could tell from "ungrouped".
  if (!name) throw new Error('A group name is required.');

  try {
    return rowToVmGroup(await insertVmGroup({ ...groupInputToColumns(input), name }));
  } catch (error) {
    if (isDuplicateName(error)) throw new Error(`A group named “${name}” already exists.`);
    throw error;
  }
};

export const updateVmGroup = async (id: string, input: VmGroupInput): Promise<VmGroup> => {
  await requireEditor('rename a VM group');

  if (input.name !== undefined && !input.name.trim()) {
    throw new Error('A group name is required.');
  }

  try {
    return rowToVmGroup(await updateVmGroupRow(id, groupInputToColumns(input)));
  } catch (error) {
    if (isDuplicateName(error)) {
      throw new Error(`A group named “${input.name?.trim()}” already exists.`);
    }
    throw error;
  }
};

// Deleting a group ungroups its VMs — the FK is `on delete set null` — so this
// is editor-level work, not an admin one-way door. Nothing about a VM is lost.
export const deleteVmGroup = async (id: string): Promise<void> => {
  await requireEditor('delete a VM group');
  await deleteVmGroupRow(id);
};

// Files a set of VMs under one group, or ungroups them all with `groupId: null`.
// The whole selection moves in a single statement (see `setVmsGroup`), so it
// either all lands or none of it does.
export const assignVmsToGroup = async (
  vmIds: string[],
  groupId: string | null
): Promise<string[]> => {
  await requireEditor('group VMs');

  const ids = vmIds.filter((id) => typeof id === 'string' && id);
  if (ids.length === 0) return [];

  const rows = await setVmsGroup(ids, groupId);
  return rows.map((row) => row.id);
};
