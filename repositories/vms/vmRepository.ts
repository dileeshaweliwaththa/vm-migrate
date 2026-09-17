import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { VmRow } from '@/types/supabase/response/vms';
import type { MigratedArchiveEntry } from '@/types/common/vm';

// Repository layer: pure Supabase data access for the `vms` table. No business
// rules — just queries returning raw rows to the service layer.

// How every other table embeds a VM when it joins to one — the select that
// produces `VmSummaryRow`. In one place because five selects across two
// repositories use it, and a copy that forgets `vm_ips` silently resolves every
// record to the machine's primary address instead of the one it answers on.
//
// **`!vm_id` is required, not decoration.** `vm_ips` has two foreign keys to
// `vms` — `vm_id` (whose machine this address is on) and `source_vm_id` (which
// machine it was taken from) — so an unqualified `vm_ips(...)` is ambiguous and
// PostgREST rejects the whole query with "more than one relationship was found".
// Naming the column rather than the constraint (`vm_ips_vm_id_fkey`) means a
// constraint rename can't break it.
export const VM_SUMMARY_EMBED =
  'vms(name, old_ip, new_ip, migrated, vm_ips!vm_id(id, address))';

// Columns a create/update may write (DB snake_case). Kept narrow so callers
// can never touch id/timestamps by accident.
export type VmWriteColumns = Partial<{
  name: string;
  old_ip: string;
  new_ip: string;
  migrated: boolean;
  is_supabase: boolean;
  keep: boolean;
  is_client: boolean;
  expanded: boolean;
  notes: string;
  migrated_archive: MigratedArchiveEntry[];
  deleted: boolean;
  deleted_at: string | null;
  group_id: string | null;
}>;

export const findAllVms = async (): Promise<VmRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vms')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VmRow[];
};

export const findVmById = async (id: string): Promise<VmRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vms').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VmRow | null) ?? null;
};

export const insertVm = async (values: VmWriteColumns): Promise<VmRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vms').insert(values).select('*').single();
  if (error) throw new Error(error.message);
  return data as VmRow;
};

export const updateVm = async (id: string, values: VmWriteColumns): Promise<VmRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vms')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as VmRow;
};

// Puts a set of VMs in one group (or ungroups them, with `groupId` null) in a
// single statement. One request rather than one per VM: grouping is a bulk
// action by nature — you select a client's whole fleet and file it at once — and
// a loop would leave a half-applied selection behind on the first failure.
export const setVmsGroup = async (ids: string[], groupId: string | null): Promise<VmRow[]> => {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vms')
    .update({ group_id: groupId })
    .in('id', ids)
    .select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as VmRow[];
};

// Wipes the table so a backup can be restored over it. **The only delete of a
// `vms` row anywhere in the app**, and the one place that needs the service-role
// client, because `vms` has no delete policy at all — a signed-in session cannot
// destroy a machine's record, admin or not (see
// `…_vms_are_never_deleted_by_a_session.sql`).
//
// That makes the `requireAdmin` in `importTracker` the *only* thing standing in
// front of this. Nothing else may call it. See docs/security.md § Service-role
// paths are the load-bearing ones.
//
// One statement rather than a row-at-a-time loop: a half-wiped tracker is not a
// state the import can recover from. `endpoints`, `vm_ips` and the Jenkins rows
// cascade; a cascade is not subject to RLS on the referencing table.
export const deleteAllVmsForImport = async (): Promise<void> => {
  const supabase = createServiceClient();
  // PostgREST refuses an unfiltered delete; this is the "match everything" form.
  const { error } = await supabase.from('vms').delete().not('id', 'is', null);
  if (error) throw new Error(error.message);
};
