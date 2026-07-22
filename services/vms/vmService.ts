import {
  findAllVms,
  findVmById,
  insertVm,
  updateVm as updateVmRow,
  deleteVm as deleteVmRow,
  type VmWriteColumns,
} from '@/repositories/vms/vmRepository';
import {
  findUrlsByVmIds,
  insertUrl,
  updateUrl as updateUrlRow,
  deleteUrl as deleteUrlRow,
  countUrlsForVm,
  type VmUrlWriteColumns,
} from '@/repositories/vmUrls/vmUrlRepository';
import type { VmRow } from '@/types/supabase/response/vms';
import type { VmUrlRow } from '@/types/supabase/response/vmUrls';
import type {
  Vm,
  VmUrl,
  VmInput,
  VmUrlInput,
  TrackerData,
  TrashType,
  Protocol,
} from '@/types/common/vm';

// Service layer: business logic and orchestration for the VM tracker. Calls
// repositories, maps raw rows into domain types, and owns all the rules
// (soft delete, restore, purge-with-archive). No React dependency.

// ---- row -> domain mappers -------------------------------------------------

const rowToUrl = (row: VmUrlRow): VmUrl => ({
  id: row.id,
  vmId: row.vm_id,
  port: row.port,
  proto: row.proto as Protocol,
  url: row.url,
  dns: row.dns,
  tested: row.tested,
  notes: row.notes,
  position: row.position,
});

const rowToVm = (row: VmRow, urls: VmUrl[]): Vm => ({
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
  return cols;
};

const urlInputToColumns = (input: VmUrlInput): VmUrlWriteColumns => {
  const cols: VmUrlWriteColumns = {};
  if (input.port !== undefined) cols.port = input.port;
  if (input.proto !== undefined) cols.proto = input.proto;
  if (input.url !== undefined) cols.url = input.url;
  if (input.dns !== undefined) cols.dns = input.dns;
  if (input.tested !== undefined) cols.tested = input.tested;
  if (input.notes !== undefined) cols.notes = input.notes;
  return cols;
};

// ---- read ------------------------------------------------------------------

// The whole tracker: active VMs and trashed VMs, each with its URLs attached.
// "Migrated from" relationships are derived on the client from this payload.
export const getTrackerData = async (): Promise<TrackerData> => {
  const rows = await findAllVms();
  const urlRows = await findUrlsByVmIds(rows.map((r) => r.id));

  const urlsByVm = new Map<string, VmUrl[]>();
  for (const row of urlRows) {
    const list = urlsByVm.get(row.vm_id) ?? [];
    list.push(rowToUrl(row));
    urlsByVm.set(row.vm_id, list);
  }

  const vms = rows.map((row) => rowToVm(row, urlsByVm.get(row.id) ?? []));
  return {
    vms: vms.filter((vm) => !vm.deleted),
    deleted: vms.filter((vm) => vm.deleted),
  };
};

// ---- VM mutations ----------------------------------------------------------

export const createVm = async (input: VmInput): Promise<Vm> => {
  const row = await insertVm(vmInputToColumns(input));
  return rowToVm(row, []);
};

export const updateVm = async (id: string, input: VmInput): Promise<Vm> => {
  const row = await updateVmRow(id, vmInputToColumns(input));
  const urlRows = await findUrlsByVmIds([id]);
  return rowToVm(row, urlRows.map(rowToUrl));
};

export const trashVm = async (id: string): Promise<void> => {
  await updateVmRow(id, { deleted: true, deleted_at: new Date().toISOString() });
};

export const restoreVm = async (id: string): Promise<void> => {
  await updateVmRow(id, { deleted: false, deleted_at: null });
};

// Permanently remove a VM. If it carried migrated URLs, first preserve them on
// the destination VM (mirrors the original tracker's archive-on-purge rule):
// prefer the "primary" VM for that IP (old_ip === new_ip = the destination
// server itself), else any other active VM sharing the new IP.
export const purgeVm = async (id: string): Promise<void> => {
  const target = await findVmById(id);
  if (!target) return;

  const source = rowToVm(target, (await findUrlsByVmIds([id])).map(rowToUrl));
  await archiveMigratedUrls(source);
  await deleteVmRow(id);
};

export const clearTrash = async (type: TrashType): Promise<void> => {
  const rows = await findAllVms();
  const trashed = rows.filter(
    (r) => r.deleted && (type === 'client' ? r.is_client : !r.is_client)
  );
  const ids = trashed.map((r) => r.id);
  const urlRows = await findUrlsByVmIds(ids);

  const urlsByVm = new Map<string, VmUrl[]>();
  for (const row of urlRows) {
    const list = urlsByVm.get(row.vm_id) ?? [];
    list.push(rowToUrl(row));
    urlsByVm.set(row.vm_id, list);
  }

  for (const row of trashed) {
    await archiveMigratedUrls(rowToVm(row, urlsByVm.get(row.id) ?? []));
    await deleteVmRow(row.id);
  }
};

// Copy a soon-to-be-purged VM's URLs onto the destination VM's archive, unless
// that VM has nothing migrated or the destination already has it archived.
const archiveMigratedUrls = async (source: Vm): Promise<void> => {
  if (source.urls.length === 0 || !source.newIp) return;

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
        urls: source.urls,
      },
    ],
  });
};

// ---- URL mutations ---------------------------------------------------------

export const addUrl = async (vmId: string, input: VmUrlInput): Promise<VmUrl> => {
  const position = await countUrlsForVm(vmId);
  const row = await insertUrl({ ...urlInputToColumns(input), vm_id: vmId, position });
  // Keep the VM expanded so the freshly added row is visible (parity with the
  // original tracker's "add URL expands the VM" behavior).
  await updateVmRow(vmId, { expanded: true });
  return rowToUrl(row);
};

export const updateUrl = async (urlId: string, input: VmUrlInput): Promise<VmUrl> => {
  const row = await updateUrlRow(urlId, urlInputToColumns(input));
  return rowToUrl(row);
};

export const deleteUrl = async (urlId: string): Promise<void> => {
  await deleteUrlRow(urlId);
};

// ---- import (replace-all) --------------------------------------------------

// Faithful port of the original tracker's "Import" — replaces ALL current data
// with the uploaded backup. Wipes every VM (URLs cascade) then recreates the
// active and trashed VMs, each with their URLs, from the payload.
export const importTracker = async (payload: TrackerData): Promise<void> => {
  const existing = await findAllVms();
  for (const row of existing) {
    await deleteVmRow(row.id);
  }

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
    });
    const urls = vm.urls ?? [];
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      await insertUrl({
        vm_id: row.id,
        port: u.port ?? '',
        proto: u.proto ?? 'HTTPS',
        url: u.url ?? '',
        dns: u.dns ?? false,
        tested: u.tested ?? false,
        notes: u.notes ?? '',
        position: i,
      });
    }
  }
};
