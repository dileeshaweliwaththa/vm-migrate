import {
  findAllVms,
  findVmById,
  insertVm,
  updateVm as updateVmRow,
  deleteVm as deleteVmRow,
  type VmWriteColumns,
} from '@/repositories/vms/vmRepository';
import {
  findAllVmGroups,
  insertVmGroup,
  deleteVmGroup,
} from '@/repositories/vmGroups/vmGroupRepository';
import { rowToVmGroup } from '@/services/vms/vmGroupService';
import { listVmJenkinsConfigs } from '@/services/jenkins/vmJenkinsService';
import {
  findEndpointById,
  findEndpointsForVms,
  insertEndpoint,
  updateEndpoint,
  deleteEndpoint,
  countEndpointsForVm,
  type EndpointWriteColumns,
} from '@/repositories/endpoints/endpointRepository';
import { getCurrentRole } from '@/services/auth/authService';
import { canEdit, isAdmin } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import type { VmRow } from '@/types/supabase/response/vms';
import type { EndpointRow } from '@/types/supabase/response/endpoints';
import type { VmJenkinsConfig } from '@/types/common/jenkins';
import type {
  Vm,
  VmUrl,
  VmGroup,
  VmInput,
  VmUrlInput,
  TrackerData,
  TrashType,
  Protocol,
} from '@/types/common/vm';

// Service layer: business logic and orchestration for the VM tracker. Calls
// repositories, maps raw rows into domain types, and owns all the rules
// (soft delete, restore, purge-with-archive). No React dependency.

// ---- authorization ---------------------------------------------------------

// Reading is open to every signed-in role; writing is not. Editors and admins
// may create, edit, trash and restore, while the irreversible operations —
// purge, clear-trash, and the replace-all import — are admin-only.
//
// Role-based RLS on `vms`/`endpoints` enforces the same split in Postgres and is
// authoritative. These checks exist so a denied action fails as a clean 403
// instead of surfacing a raw policy-violation error, and so the rule is stated
// where the rest of the tracker's rules live.

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

// ---- row -> domain mappers -------------------------------------------------

// One `endpoints` row as the tracker sees it. A VM-owned row carries its own
// `vm_id`; a project's record carries an environment instead, and the VM is read
// off that environment — the endpoint never stores a second copy of it, so
// moving an environment to another host moves its URLs with it.
const rowToUrl = (row: EndpointRow): VmUrl => ({
  id: row.id,
  vmId: row.vm_id ?? row.environments?.vm_id ?? '',
  port: row.port,
  proto: row.protocol as Protocol,
  url: row.domain,
  dns: row.dns,
  tested: row.tested,
  notes: row.notes,
  position: row.position,
  environmentId: row.environment_id,
  projectId: row.environments?.project_id ?? null,
  projectName: row.environments?.projects?.name ?? '',
  projectSlug: row.environments?.projects?.slug ?? '',
  environmentName: row.environments?.name ?? '',
});

const rowToVm = (
  row: VmRow,
  urls: VmUrl[],
  // The VM's Jenkins server, when the caller has it. A VM built straight from a
  // row — a create, an import — has none until it is configured, which is why
  // this defaults rather than being required.
  jenkins: VmJenkinsConfig | null = null
): Vm => ({
  id: row.id,
  name: row.name,
  oldIp: row.old_ip,
  newIp: row.new_ip,
  migrated: row.migrated,
  isSupabase: row.is_supabase,
  keep: row.keep,
  isClient: row.is_client,
  expanded: row.expanded,
  notes: row.notes,
  migratedArchive: row.migrated_archive ?? [],
  deleted: row.deleted,
  deletedAt: row.deleted_at,
  groupId: row.group_id,
  jenkins,
  urls,
});

// ---- input -> write-column mappers ----------------------------------------

const vmInputToColumns = (input: VmInput): VmWriteColumns => {
  const cols: VmWriteColumns = {};
  if (input.name !== undefined) cols.name = input.name;
  if (input.oldIp !== undefined) cols.old_ip = input.oldIp;
  if (input.newIp !== undefined) cols.new_ip = input.newIp;
  if (input.migrated !== undefined) cols.migrated = input.migrated;
  if (input.isSupabase !== undefined) cols.is_supabase = input.isSupabase;
  if (input.keep !== undefined) cols.keep = input.keep;
  if (input.isClient !== undefined) cols.is_client = input.isClient;
  if (input.expanded !== undefined) cols.expanded = input.expanded;
  if (input.notes !== undefined) cols.notes = input.notes;
  // Null is a meaningful value here (ungroup), so this checks for `undefined`
  // rather than falsiness like the strings above.
  if (input.groupId !== undefined) cols.group_id = input.groupId;
  return cols;
};

// The tracker's field names predate the unified table, so they map onto its
// columns here: `proto` -> `protocol`, `url` -> `domain`. Nothing else in the
// tracker knows those columns were ever named anything else.
const urlInputToColumns = (input: VmUrlInput): EndpointWriteColumns => {
  const cols: EndpointWriteColumns = {};
  if (input.port !== undefined) cols.port = input.port;
  if (input.proto !== undefined) cols.protocol = input.proto;
  if (input.url !== undefined) cols.domain = input.url.trim();
  if (input.dns !== undefined) cols.dns = input.dns;
  if (input.tested !== undefined) cols.tested = input.tested;
  if (input.notes !== undefined) cols.notes = input.notes;
  return cols;
};

// ---- read ------------------------------------------------------------------

// The whole tracker: active VMs and trashed VMs, each with its URLs attached,
// plus every group the rows can be filed under. "Migrated from" relationships
// are derived on the client from this payload.
//
// The groups ride along rather than getting a query of their own so the grid can
// render its group headers — including the empty groups, which have no VM to
// arrive with — from the one payload it already waits for.
export const getTrackerData = async (): Promise<TrackerData> => {
  const rows = await findAllVms();
  const endpointRows = await findEndpointsForVms(rows.map((r) => r.id));
  const groupRows = await findAllVmGroups();
  // Which machines have a Jenkins server configured — two queries for the whole
  // grid, not two per VM. Secret-free: `hasToken` is a boolean.
  const jenkinsByVm = new Map((await listVmJenkinsConfigs()).map((c) => [c.vmId, c]));

  const urlsByVm = groupUrlsByVm(endpointRows);

  const vms = rows.map((row) =>
    rowToVm(row, urlsByVm.get(row.id) ?? [], jenkinsByVm.get(row.id) ?? null)
  );
  return {
    vms: vms.filter((vm) => !vm.deleted),
    deleted: vms.filter((vm) => vm.deleted),
    groups: groupRows.map(rowToVmGroup),
  };
};

// Endpoints keyed by the VM they belong to — a VM-owned row by its own `vm_id`,
// a project's record by its environment's. Sorted so a VM's own rows lead and
// the project records follow, each block in `position` order: the tracker's
// editable rows stay where they have always been, and the imported ones read as
// a group underneath.
const groupUrlsByVm = (rows: EndpointRow[]): Map<string, VmUrl[]> => {
  const byVm = new Map<string, VmUrl[]>();
  for (const row of rows) {
    const url = rowToUrl(row);
    // A project record whose environment has no VM (a managed platform) has no
    // machine to appear under, which is correct — it is not a host endpoint.
    if (!url.vmId) continue;
    const list = byVm.get(url.vmId) ?? [];
    list.push(url);
    byVm.set(url.vmId, list);
  }
  for (const list of byVm.values()) {
    list.sort(
      (a, b) =>
        Number(Boolean(a.environmentId)) - Number(Boolean(b.environmentId)) ||
        a.position - b.position
    );
  }
  return byVm;
};

// ---- VM mutations ----------------------------------------------------------

export const createVm = async (input: VmInput): Promise<Vm> => {
  await requireEditor('add a VM');
  const row = await insertVm(vmInputToColumns(input));
  return rowToVm(row, []);
};

export const updateVm = async (id: string, input: VmInput): Promise<Vm> => {
  await requireEditor('edit a VM');
  const row = await updateVmRow(id, vmInputToColumns(input));
  const urlRows = await findEndpointsForVms([id]);
  return rowToVm(row, groupUrlsByVm(urlRows).get(id) ?? []);
};

export const trashVm = async (id: string): Promise<void> => {
  await requireEditor('delete a VM');
  await updateVmRow(id, { deleted: true, deleted_at: new Date().toISOString() });
};

export const restoreVm = async (id: string): Promise<void> => {
  await requireEditor('restore a VM');
  await updateVmRow(id, { deleted: false, deleted_at: null });
};

// Permanently remove a VM. If it carried migrated URLs, first preserve them on
// the destination VM (mirrors the original tracker's archive-on-purge rule):
// prefer the "primary" VM for that IP (old_ip === new_ip = the destination
// server itself), else any other active VM sharing the new IP.
export const purgeVm = async (id: string): Promise<void> => {
  await requireAdmin('permanently delete a VM');

  const target = await findVmById(id);
  if (!target) return;

  const source = rowToVm(target, groupUrlsByVm(await findEndpointsForVms([id])).get(id) ?? []);
  await archiveMigratedUrls(source);
  await deleteVmRow(id);
};

export const clearTrash = async (type: TrashType): Promise<void> => {
  await requireAdmin('empty the trash');

  const rows = await findAllVms();
  const trashed = rows.filter(
    (r) => r.deleted && (type === 'client' ? r.is_client : !r.is_client)
  );
  const ids = trashed.map((r) => r.id);
  const urlsByVm = groupUrlsByVm(await findEndpointsForVms(ids));

  for (const row of trashed) {
    await archiveMigratedUrls(rowToVm(row, urlsByVm.get(row.id) ?? []));
    await deleteVmRow(row.id);
  }
};

// Copy a soon-to-be-purged VM's URLs onto the destination VM's archive, unless
// that VM has nothing migrated or the destination already has it archived.
const archiveMigratedUrls = async (source: Vm): Promise<void> => {
  // Only the VM's own endpoints: a project's records outlive the VM (they hang
  // off the environment, which merely loses its `vm_id`), so archiving a copy of
  // them here would preserve nothing and duplicate rows that still exist.
  const ownUrls = source.urls.filter((url) => !url.environmentId);
  if (ownUrls.length === 0 || !source.newIp) return;

  const rows = await findAllVms();
  const candidates = rows.filter(
    (r) => !r.deleted && r.id !== source.id && r.new_ip === source.newIp
  );
  const primary = candidates.find((r) => r.old_ip === r.new_ip);
  const dest = primary ?? candidates[0];
  if (!dest) return;

  const archive = dest.migrated_archive ?? [];
  if (archive.some((entry) => entry.id === source.id)) return;

  await updateVmRow(dest.id, {
    migrated_archive: [
      ...archive,
      {
        id: source.id,
        name: source.name,
        oldIp: source.oldIp,
        newIp: source.newIp,
        urls: ownUrls,
      },
    ],
  });
};

// ---- URL mutations ---------------------------------------------------------

// Adds a **VM-owned** endpoint: `vm_id` set, no environment. That is the only
// kind the tracker creates — a URL that belongs to a project is added from that
// project's environment, so it has one home and one place it is maintained.
export const addUrl = async (vmId: string, input: VmUrlInput): Promise<VmUrl> => {
  await requireEditor('add a URL');
  const position = await countEndpointsForVm(vmId);
  const row = await insertEndpoint({
    ...urlInputToColumns(input),
    vm_id: vmId,
    environment_id: null,
    source: 'manual',
    position,
  });
  // Keep the VM expanded so the freshly added row is visible (parity with the
  // original tracker's "add URL expands the VM" behavior).
  await updateVmRow(vmId, { expanded: true });
  return rowToUrl(row);
};

// Editing is allowed on either kind. A project record's port, protocol, domain
// and migration checklist are the same facts whichever page you are looking at,
// and the tracker is where the DNS/tested columns are actually worked through.
export const updateUrl = async (urlId: string, input: VmUrlInput): Promise<VmUrl> => {
  await requireEditor('edit a URL');
  const row = await updateEndpoint(urlId, urlInputToColumns(input));
  return rowToUrl(row);
};

// Deleting, unlike editing, stays with the owner: a project's record is removed
// from that project's environment, never from the tracker, or the project's
// records table would silently lose rows to a page that never created them.
// The UI hides the button; this is the boundary.
export const deleteUrl = async (urlId: string): Promise<void> => {
  await requireEditor('delete a URL');

  const row = await findEndpointById(urlId);
  if (row?.environment_id) {
    throw new Error(
      'This URL belongs to a project environment. Delete it from the project instead.'
    );
  }

  await deleteEndpoint(urlId);
};

// ---- import (replace-all) --------------------------------------------------

// Faithful port of the original tracker's "Import" — replaces ALL current data
// with the uploaded backup. Wipes every VM (URLs cascade) and every group, then
// recreates the groups, the active and trashed VMs, and their URLs from the
// payload.
export const importTracker = async (payload: TrackerData): Promise<void> => {
  await requireAdmin('import tracker data');

  const existing = await findAllVms();
  for (const row of existing) {
    await deleteVmRow(row.id);
  }

  // Groups are replaced too, or "replace-all" would leave the old groups behind
  // with nothing in them. Recreating them mints new ids, so the payload's VM
  // `groupId`s are remapped through this table as the rows go back in.
  const groupIds = await replaceGroups(payload.groups ?? []);

  const groups: { vm: Vm; deleted: boolean }[] = [
    ...(payload.vms ?? []).map((vm) => ({ vm, deleted: false })),
    ...(payload.deleted ?? []).map((vm) => ({ vm, deleted: true })),
  ];

  for (const { vm, deleted } of groups) {
    const row = await insertVm({
      name: vm.name ?? '',
      old_ip: vm.oldIp ?? '',
      new_ip: vm.newIp ?? '',
      migrated: vm.migrated ?? false,
      is_supabase: vm.isSupabase ?? false,
      keep: vm.keep ?? false,
      is_client: vm.isClient ?? false,
      expanded: vm.expanded ?? true,
      notes: vm.notes ?? '',
      migrated_archive: vm.migratedArchive ?? [],
      deleted,
      deleted_at: deleted ? vm.deletedAt ?? new Date().toISOString() : null,
      // A backup written before groups existed has no `groupId` at all, and one
      // naming a group that didn't survive the remap lands ungrouped rather than
      // failing the whole import.
      group_id: (vm.groupId && groupIds.get(vm.groupId)) || null,
    });
    // Only the VM's own endpoints are restored. A project's records belong to
    // that project — they are still in the database, attached to their
    // environment — so recreating them here would duplicate every one of them
    // as a VM-owned row. Exports carry them (they are part of what the VM
    // serves) and mark them, which is what lets the import skip them.
    const urls = (vm.urls ?? []).filter((u) => !u.environmentId);
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      await insertEndpoint({
        vm_id: row.id,
        environment_id: null,
        port: u.port ?? '',
        protocol: u.proto ?? 'HTTPS',
        domain: u.url ?? '',
        dns: u.dns ?? false,
        tested: u.tested ?? false,
        notes: u.notes ?? '',
        source: 'manual',
        position: i,
      });
    }
  }
};

// Wipes the group table and recreates it from a backup, returning
// old id -> new id for remapping the VMs that referenced them.
//
// Tolerant by design: a group with no name can't exist (the name is the whole
// group) and two groups can't share one, so unnamed entries are dropped and a
// repeated name maps onto the group already created for it. An import is a
// recovery path — it shouldn't fail on a backup that a since-tightened rule
// would now reject.
const replaceGroups = async (groups: VmGroup[]): Promise<Map<string, string>> => {
  const existing = await findAllVmGroups();
  for (const row of existing) {
    await deleteVmGroup(row.id);
  }

  const idByOldId = new Map<string, string>();
  const idByName = new Map<string, string>();
  for (const group of groups) {
    const name = group.name?.trim();
    if (!name) continue;

    const already = idByName.get(name.toLowerCase());
    if (already) {
      idByOldId.set(group.id, already);
      continue;
    }

    const row = await insertVmGroup({ name, notes: group.notes ?? '' });
    idByName.set(name.toLowerCase(), row.id);
    idByOldId.set(group.id, row.id);
  }
  return idByOldId;
};
