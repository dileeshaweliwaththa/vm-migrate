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
  moveEndpointsToVm,
  setEndpointsIpForEnvironments,
  countEndpointsForVm,
  type EndpointWriteColumns,
} from '@/repositories/endpoints/endpointRepository';
import { setEnvironmentsVm } from '@/repositories/environments/environmentRepository';
import {
  findVmIpsForVms,
  findVmIpsBySourceVm,
  insertVmIp,
  updateVmIp as updateVmIpRow,
  deleteVmIp as deleteVmIpRow,
  countVmIpsForVm,
  type VmIpWriteColumns,
} from '@/repositories/vmIps/vmIpRepository';
import { getCurrentRole } from '@/services/auth/authService';
import { canEdit, isAdmin } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import type { VmRow } from '@/types/supabase/response/vms';
import type { EndpointRow } from '@/types/supabase/response/endpoints';
import type { VmIpRow } from '@/types/supabase/response/vmIps';
import type { VmJenkinsConfig } from '@/types/common/jenkins';
import type {
  Vm,
  VmIp,
  VmUrl,
  VmGroup,
  VmInput,
  VmIpInput,
  VmIpMoveInput,
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
  ipId: row.ip_id ?? null,
  environmentId: row.environment_id,
  projectId: row.environments?.project_id ?? null,
  projectName: row.environments?.projects?.name ?? '',
  projectSlug: row.environments?.projects?.slug ?? '',
  environmentName: row.environments?.name ?? '',
  environmentLabel: row.environments?.label ?? '',
});

// One `vm_ips` row: an address this machine answers on beyond its own `new_ip`.
const rowToVmIp = (row: VmIpRow): VmIp => ({
  id: row.id,
  vmId: row.vm_id,
  address: row.address,
  label: row.label,
  origin: row.origin,
  sourceVmId: row.source_vm_id,
  sourceVmName: row.source_vm_name,
  movedAt: row.moved_at ?? '',
  position: row.position,
  notes: row.notes,
});

const rowToVm = (
  row: VmRow,
  urls: VmUrl[],
  // The VM's Jenkins server, when the caller has it. A VM built straight from a
  // row — a create, an import — has none until it is configured, which is why
  // this defaults rather than being required.
  jenkins: VmJenkinsConfig | null = null,
  // The machine's adopted addresses. Defaults to none for the same reason: a
  // freshly created VM has only its own.
  ips: VmIp[] = []
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
  ips,
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
  // Null is meaningful — "back to the VM's primary address" — so this checks for
  // `undefined`, like `groupId` above.
  if (input.ipId !== undefined) cols.ip_id = input.ipId;
  return cols;
};

const ipInputToColumns = (input: VmIpInput): VmIpWriteColumns => {
  const cols: VmIpWriteColumns = {};
  if (input.address !== undefined) cols.address = input.address.trim();
  if (input.label !== undefined) cols.label = input.label;
  if (input.origin !== undefined) cols.origin = input.origin;
  if (input.sourceVmId !== undefined) cols.source_vm_id = input.sourceVmId;
  if (input.sourceVmName !== undefined) cols.source_vm_name = input.sourceVmName;
  // The column is a `date`, and '' is not one — an address with no recorded move
  // date stores null.
  if (input.movedAt !== undefined) cols.moved_at = input.movedAt || null;
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
  // The extra addresses, for the whole grid in one query — same shape as the
  // endpoints and the Jenkins configs above, and for the same reason.
  const ipsByVm = groupIpsByVm(await findVmIpsForVms(rows.map((r) => r.id)));

  const urlsByVm = groupUrlsByVm(endpointRows);

  const vms = rows.map((row) =>
    rowToVm(
      row,
      urlsByVm.get(row.id) ?? [],
      jenkinsByVm.get(row.id) ?? null,
      ipsByVm.get(row.id) ?? []
    )
  );
  return {
    vms: vms.filter((vm) => !vm.deleted),
    deleted: vms.filter((vm) => vm.deleted),
    groups: groupRows.map(rowToVmGroup),
  };
};

const groupIpsByVm = (rows: VmIpRow[]): Map<string, VmIp[]> => {
  const byVm = new Map<string, VmIp[]>();
  for (const row of rows) {
    const list = byVm.get(row.vm_id) ?? [];
    list.push(rowToVmIp(row));
    byVm.set(row.vm_id, list);
  }
  return byVm;
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
  const ipRows = await findVmIpsForVms([id]);
  return rowToVm(row, groupUrlsByVm(urlRows).get(id) ?? [], null, ipRows.map(rowToVmIp));
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
  if (ownUrls.length === 0) return;

  const rows = await findAllVms();

  // The machine that took this one's address, if that was recorded — an explicit
  // link, so it beats every guess below. Checked first because the IP-equality
  // rule cannot find it: an address that moved without changing leaves the source
  // and destination with no matching pair of `new_ip`s.
  const adopted = (await findVmIpsBySourceVm(source.id))
    .map((ip) => rows.find((r) => r.id === ip.vm_id && !r.deleted))
    .find(Boolean);

  // Only meaningful when the source names a destination address at all — without
  // that, every VM with a blank `new_ip` would look like a match.
  const candidates = source.newIp
    ? rows.filter((r) => !r.deleted && r.id !== source.id && r.new_ip === source.newIp)
    : [];
  const primary = candidates.find((r) => r.old_ip === r.new_ip);
  const dest = adopted ?? primary ?? candidates[0];
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

// ---- address mutations -----------------------------------------------------

// Adds one of the machine's **extra** addresses. Its own address is `new_ip` on
// the VM row and is edited as a field there; this is everything beyond it.
export const addVmIp = async (vmId: string, input: VmIpInput): Promise<VmIp> => {
  await requireEditor('add an IP');

  // The `(vm_id, address)` unique index can't see the primary — that address is a
  // column on `vms`, not a row here — so this is the half of "one machine, one
  // copy of each address" that has to be checked in code.
  const vm = await findVmById(vmId);
  const address = (input.address ?? '').trim();
  if (address && vm?.new_ip && address === vm.new_ip) {
    throw new Error('That is already this VM’s primary address.');
  }

  const position = await countVmIpsForVm(vmId);
  const row = await insertVmIp({
    origin: 'assigned',
    ...ipInputToColumns(input),
    vm_id: vmId,
    position,
  });
  // Same rule as adding a URL: keep the VM open so the row that was just added is
  // on screen rather than behind a chevron.
  await updateVmRow(vmId, { expanded: true });
  return rowToVmIp(row);
};

export const updateVmIp = async (ipId: string, input: VmIpInput): Promise<VmIp> => {
  await requireEditor('edit an IP');
  return rowToVmIp(await updateVmIpRow(ipId, ipInputToColumns(input)));
};

// Removing an address is editor work, not admin work: `endpoints.ip_id` is
// `on delete set null`, so the endpoints that were on it fall back to the VM's
// primary address instead of being deleted with it.
export const deleteVmIp = async (ipId: string): Promise<void> => {
  await requireEditor('delete an IP');
  await deleteVmIpRow(ipId);
};

// "This machine's public IP was reattached to that one" — the whole thing, as one
// action.
//
// Recording it by hand is three edits in three places (add the address, repoint
// every URL, retire the source), and a tracker that has had two of the three done
// to it describes a migration that never happened. Which is exactly the state
// this feature was built to fix.
export const moveVmIp = async (destVmId: string, input: VmIpMoveInput): Promise<VmIp> => {
  await requireEditor('move an IP between VMs');

  const source = await findVmById(input.sourceVmId);
  if (!source) throw new Error('The VM that address is coming from no longer exists.');
  if (source.id === destVmId) throw new Error('A VM cannot take an address from itself.');

  // The address the source actually answers on — its **own** (`old_ip`), not its
  // `new_ip`. A retired machine's `new_ip` is where its workload was said to be
  // going, which is precisely the claim being corrected here.
  const address = (input.address ?? source.old_ip ?? '').trim() || source.new_ip;
  if (!address) throw new Error('That VM has no address to move.');

  const position = await countVmIpsForVm(destVmId);
  const row = await insertVmIp({
    vm_id: destVmId,
    address,
    label: input.label ?? '',
    origin: 'moved',
    source_vm_id: source.id,
    // Snapshot, because the FK above is `on delete set null` and the name has to
    // outlive the machine — it is the whole provenance once the row is purged.
    source_vm_name: source.name,
    moved_at: input.movedAt || new Date().toISOString().slice(0, 10),
    notes: input.notes ?? '',
    position,
  });

  // The URLs never changed; the box under them did. They keep their DNS and
  // tested ticks, their notes and their ids, and simply answer on this VM now —
  // on the address that came with them.
  //
  // Both kinds of row have to move, and they move by different means, because
  // they name their VM in different places (see docs/tracker.md § URLs live in
  // one table):
  //
  //   * a **VM-owned** row carries `vm_id`, so the row itself is repointed;
  //   * a **project record** has no `vm_id` at all — it is shown under whatever
  //     machine its environment sits on, so the *environment* is repointed and
  //     the records follow. Leaving them behind would strand them on a retired
  //     machine, which is the one outcome worse than not moving them at all.
  if (input.moveUrls !== false) {
    await moveEndpointsToVm(source.id, destVmId, row.id);
    const moved = await setEnvironmentsVm(source.id, destVmId);
    await setEndpointsIpForEnvironments(
      moved.map((environment) => environment.id),
      row.id
    );
  }

  if (input.trashSource !== false) {
    await updateVmRow(source.id, {
      deleted: true,
      deleted_at: new Date().toISOString(),
      // The machine did not migrate anywhere — it was retired and its address
      // went elsewhere — so it must stop claiming a destination address it never
      // had. Left alone, that claim is what makes the grid show a migration that
      // didn't happen (and draws a phantom "Migrated from" row on the VM whose
      // address it named).
      ...(source.old_ip ? { new_ip: source.old_ip } : {}),
    });
  }

  await updateVmRow(destVmId, { expanded: true });
  return rowToVmIp(row);
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
    // The machine's extra addresses come back before its URLs, because a URL may
    // name one. Recreating them mints new ids, so this map remaps the payload's
    // `ipId`s the same way `groupIds` remaps the groups. A backup written before
    // addresses existed has none, and every URL lands on the primary — which is
    // exactly what those rows already meant.
    const ipIds = new Map<string, string>();
    for (let i = 0; i < (vm.ips ?? []).length; i++) {
      const ip = vm.ips[i];
      if (!ip.address?.trim()) continue;
      const ipRow = await insertVmIp({
        vm_id: row.id,
        address: ip.address.trim(),
        label: ip.label ?? '',
        origin: ip.origin === 'moved' ? 'moved' : 'assigned',
        // Not remapped onto the freshly minted VM ids: the name snapshot is what
        // the history is read from, and a dangling FK would be worse than a null
        // one. `source_vm_name` survives the round trip intact.
        source_vm_id: null,
        source_vm_name: ip.sourceVmName ?? '',
        moved_at: ip.movedAt || null,
        notes: ip.notes ?? '',
        position: i,
      });
      ipIds.set(ip.id, ipRow.id);
    }

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
        // An `ipId` naming an address that didn't survive the remap falls back to
        // the primary rather than failing the whole import — the same tolerance
        // the group remap has.
        ip_id: (u.ipId && ipIds.get(u.ipId)) || null,
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
