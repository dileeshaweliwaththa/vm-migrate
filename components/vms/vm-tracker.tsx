'use client';

import { useEffect, useState } from 'react';
import { Download, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/layout/page-header';
import { computeStats } from '@/lib/vm-utils';
import { canEdit, isAdmin } from '@/lib/rbac';
import type { UserRole } from '@/types/common';
import type { TrackerData, Vm, VmUrl, TrashType } from '@/types/common/vm';
import {
  useTrackerData,
  useCreateVm,
  useUpdateVm,
  useTrashVm,
  useRestoreVm,
  usePurgeVm,
  useClearTrash,
  useAddUrl,
  useUpdateUrl,
  useDeleteUrl,
  useImportTracker,
} from '@/hooks/vms/useVmTracker';
import type { VmHandlers } from './vm-fields';
import { VmRow, TRACKER_COLUMNS } from './vm-row';
import { VmCard } from './vm-card';
import { VmViewToggle, useVmView } from './vm-view-toggle';
import { VmTrash } from './vm-trash';

const COLUMN_HEADERS = [
  '',
  'VM Name',
  'Old IP',
  'New IP',
  'Port',
  'Protocol',
  'URL / Domain',
  'Full New URL',
  'DNS Updated?',
  'URL Tested?',
  'VM Migrated?',
  'Supabase?',
  'Not Migrating?',
  'Safe to Remove?',
  'Notes',
  'Actions',
];

const SECTIONS: { label: string; isClient: boolean }[] = [
  { label: '🖥️ UPVIEW VMs — Our Servers', isClient: false },
  { label: '👤 Client VMs', isClient: true },
];

// The tracker is readable by every signed-in role. Editors and admins can edit
// it; the irreversible actions — permanent delete, empty trash, and the
// replace-all import — are admin-only. These flags only decide which controls
// render: `vmService` re-checks the role and RLS enforces it in Postgres, so a
// hidden button is convenience, never the boundary.
export function VmTracker({ role }: { role: UserRole }) {
  const canWrite = canEdit(role);
  const canPurge = isAdmin(role);

  const { data: loaded, isLoading, error, refetch } = useTrackerData();
  const [data, setData] = useState<TrackerData | null>(null);
  // Table or cards. Remembered per browser, not per user — it is a viewing
  // preference, not data, and both views read and write the same rows.
  const [view, setView] = useVmView();

  // Local state is the source of truth for rendering (instant edits, no
  // per-keystroke requests). It re-syncs whenever the query payload changes —
  // which only happens on the initial load and after an explicit refetch
  // (purge / clear trash / import), so in-progress edits are never clobbered.
  useEffect(() => {
    if (loaded) setData(loaded);
  }, [loaded]);

  const createVm = useCreateVm();
  const updateVm = useUpdateVm();
  const trashVm = useTrashVm();
  const restoreVm = useRestoreVm();
  const purgeVm = usePurgeVm();
  const clearTrash = useClearTrash();
  const addUrl = useAddUrl();
  const updateUrl = useUpdateUrl();
  const deleteUrl = useDeleteUrl();
  const importTracker = useImportTracker();

  const patchLocalVm = (id: string, patch: Partial<Vm>) =>
    setData((d) => (d ? { ...d, vms: d.vms.map((v) => (v.id === id ? { ...v, ...patch } : v)) } : d));

  const patchLocalUrl = (vmId: string, urlId: string, patch: Partial<VmUrl>) =>
    setData((d) =>
      d
        ? {
            ...d,
            vms: d.vms.map((v) =>
              v.id === vmId
                ? { ...v, urls: v.urls.map((u) => (u.id === urlId ? { ...u, ...patch } : u)) }
                : v
            ),
          }
        : d
    );

  const handlers: VmHandlers = {
    onToggleExpand: (vm) => patchLocalVm(vm.id, { expanded: !vm.expanded }),
    onVmLocalChange: patchLocalVm,
    onVmCommit: (id, patch) => {
      patchLocalVm(id, patch);
      updateVm.mutate({ id, input: patch });
    },
    onToggleClient: (vm) => {
      patchLocalVm(vm.id, { isClient: !vm.isClient });
      updateVm.mutate({ id: vm.id, input: { isClient: !vm.isClient } });
    },
    onTrash: (id) => {
      setData((d) => {
        if (!d) return d;
        const vm = d.vms.find((v) => v.id === id);
        return {
          vms: d.vms.filter((v) => v.id !== id),
          deleted: vm
            ? [{ ...vm, deleted: true, deletedAt: new Date().toISOString() }, ...d.deleted]
            : d.deleted,
        };
      });
      trashVm.mutate(id);
    },
    onAddUrl: async (vmId) => {
      try {
        const url = await addUrl.mutateAsync({ vmId });
        setData((d) =>
          d
            ? {
                ...d,
                vms: d.vms.map((v) =>
                  v.id === vmId ? { ...v, expanded: true, urls: [...v.urls, url] } : v
                ),
              }
            : d
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Failed to add URL.');
      }
    },
    onUrlLocalChange: patchLocalUrl,
    onUrlCommit: (vmId, urlId, patch) => {
      patchLocalUrl(vmId, urlId, patch);
      updateUrl.mutate({ vmId, urlId, input: patch });
    },
    onDeleteUrl: (vmId, urlId) => {
      setData((d) =>
        d
          ? {
              ...d,
              vms: d.vms.map((v) =>
                v.id === vmId ? { ...v, urls: v.urls.filter((u) => u.id !== urlId) } : v
              ),
            }
          : d
      );
      deleteUrl.mutate({ vmId, urlId });
    },
  };

  // Takes the section it was invoked from, so the row lands in the table that was
  // clicked. Previously hardcoded to UPVIEW, which was fine with a single table
  // but would put every "add" in the wrong section now there are two.
  const handleAddVm = async (isClient: boolean) => {
    try {
      const vm = await createVm.mutateAsync({ isClient });
      setData((d) => (d ? { ...d, vms: [...d.vms, vm] } : d));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create VM.');
    }
  };

  const setAllExpanded = (expanded: boolean) =>
    setData((d) => (d ? { ...d, vms: d.vms.map((v) => ({ ...v, expanded })) } : d));

  const handleRestore = (id: string) => {
    setData((d) => {
      if (!d) return d;
      const vm = d.deleted.find((v) => v.id === id);
      return {
        deleted: d.deleted.filter((v) => v.id !== id),
        vms: vm ? [...d.vms, { ...vm, deleted: false, deletedAt: null }] : d.vms,
      };
    });
    restoreVm.mutate(id);
  };

  const handlePurge = (id: string) => {
    if (!confirm('Permanently delete this VM? This cannot be undone.')) return;
    setData((d) => (d ? { ...d, deleted: d.deleted.filter((v) => v.id !== id) } : d));
    purgeVm.mutate(id, { onSuccess: () => refetch() });
  };

  const handleClearTrash = (type: TrashType) => {
    const label = type === 'client' ? 'CLIENT' : 'UPVIEW';
    if (!confirm(`Permanently delete ALL ${label} VMs in the trash? This cannot be undone.`)) return;
    setData((d) =>
      d
        ? { ...d, deleted: d.deleted.filter((v) => (type === 'client' ? !v.isClient : !!v.isClient)) }
        : d
    );
    clearTrash.mutate(type, { onSuccess: () => refetch() });
  };

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vm-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const parsed = JSON.parse(String(ev.target?.result)) as TrackerData;
          if (!parsed.vms) throw new Error('missing vms');
          if (!confirm('Importing will REPLACE all current tracker data. Continue?')) return;
          await importTracker.mutateAsync({ vms: parsed.vms, deleted: parsed.deleted ?? [] });
          await refetch();
          alert('Data imported successfully!');
        } catch {
          alert('Invalid file. Please use a valid VM Tracker backup JSON.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  if (isLoading) {
    return <div className="p-10 text-sm text-muted-foreground">Loading VMs…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-10 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load the tracker.'}
      </div>
    );
  }

  const stats = computeStats(data.vms);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        // The one page that pins its header: the migration counters have to stay
        // on screen while the (very wide, very long) tracker table scrolls.
        sticky
        title="VM Migration Tracker"
        stats={
          <>
            <span>
              VMs: <b className="text-foreground">{stats.vms}</b>
            </span>
            <span>
              Migrated:{' '}
              <b className="text-ink-target">
                {stats.migrated}/{stats.vms}
              </b>
            </span>
            <span>
              Supabase: <b className="text-ink-accent">{stats.supa}</b>
            </span>
            <span>
              Not Migrating: <b className="text-ink-accent">{stats.keeping}</b>
            </span>
            <span>
              URLs: <b className="text-foreground">{stats.urls}</b>
            </span>
            <span>
              DNS done:{' '}
              <b className="text-ink-target">
                {stats.dns}/{stats.urls}
              </b>
            </span>
            <span>
              Tested:{' '}
              <b className="text-ink-target">
                {stats.tested}/{stats.urls}
              </b>
            </span>
          </>
        }
        actions={
          <>
            {/* Layout only — it changes nothing about the data, so every role
                gets it. Expand All / Collapse All below drive both views: the
                open/closed flag lives on the VM, not on a view. */}
            <VmViewToggle value={view} onChange={setView} />
            {/* Export is a read of data already on screen — open to viewers. */}
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4" /> Export
            </Button>
            {canPurge ? (
              <Button variant="outline" size="sm" onClick={handleImport}>
                <Upload className="size-4" /> Import
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setAllExpanded(true)}>
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAllExpanded(false)}>
              Collapse All
            </Button>
            {/* `() => handleAddVm(false)`, not `handleAddVm` directly: the latter
                hands the click event in as `isClient` — truthy — so every VM added
                from the header would land in the Client table. */}
            {canWrite ? (
              <Button size="sm" onClick={() => handleAddVm(false)}>
                <Plus className="size-4" /> Add VM
              </Button>
            ) : (
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Read-only
              </span>
            )}
          </>
        }
      />

      {/* `min-w-0` for the same reason as SidebarInset: this is a flex item too,
          so without it the 1800px table pushes the page wide rather than letting
          the container below scroll. Both levels are needed — the constraint has
          to hold all the way down the chain. */}
      <main className="min-w-0 flex-1 space-y-6 p-4">
        {/* One table per section rather than one table with divider rows. Each gets
            its own column headers, so a section is readable on its own, and its
            title sits *outside* the scroll container — where a wide table can never
            push it out of view. */}
        {SECTIONS.map(({ label, isClient }) => {
          const sectionVms = data.vms.filter((v) => v.isClient === isClient);
          return (
            <section key={label} aria-label={label} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold tracking-wide uppercase">{label}</h2>
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {sectionVms.length}
                </span>
              </div>

              {view === 'cards' ? (
                // `items-start` so a card left collapsed doesn't stretch to the
                // height of an expanded neighbour in the same row.
                <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {sectionVms.length === 0 ? (
                    <p className="col-span-full rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                      No {isClient ? 'client' : 'UPVIEW'} VMs yet.
                    </p>
                  ) : (
                    sectionVms.map((vm) => (
                      <VmCard
                        key={vm.id}
                        vm={vm}
                        // The full lists, for the same reason as the grid: the
                        // "Migrated from" history matches on destination IP and
                        // crosses the UPVIEW/Client split.
                        allVms={data.vms}
                        allDeleted={data.deleted}
                        h={handlers}
                        canWrite={canWrite}
                      />
                    ))
                  )}
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => handleAddVm(isClient)}
                      className="col-span-full rounded-lg border-2 border-dashed border-primary/40 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
                    >
                      + Add {isClient ? 'Client' : 'UPVIEW'} VM
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <Table className="min-w-[1800px]">
                    <TableHeader>
                      <TableRow>
                        {COLUMN_HEADERS.map((columnLabel, i) => (
                          <TableHead
                            key={`${columnLabel}-${i}`}
                            className={i >= 4 && i <= 13 ? 'text-center' : undefined}
                          >
                            {columnLabel}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sectionVms.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell
                            colSpan={TRACKER_COLUMNS}
                            className="py-6 text-center text-sm text-muted-foreground"
                          >
                            No {isClient ? 'client' : 'UPVIEW'} VMs yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        sectionVms.map((vm) => (
                          <VmRow
                            key={vm.id}
                            vm={vm}
                            // Deliberately the *full* lists, not this section's: the
                            // "Migrated from" history matches on destination IP, and a
                            // client VM can migrate onto an UPVIEW VM (or vice versa).
                            // Passing sectionVms would silently hide those rows.
                            allVms={data.vms}
                            allDeleted={data.deleted}
                            h={handlers}
                            canWrite={canWrite}
                          />
                        ))
                      )}
                      {canWrite && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={TRACKER_COLUMNS} className="p-3">
                            <button
                              type="button"
                              onClick={() => handleAddVm(isClient)}
                              className="w-full rounded-lg border-2 border-dashed border-primary/40 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
                            >
                              + Add {isClient ? 'Client' : 'UPVIEW'} VM
                            </button>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          );
        })}

        <VmTrash
          deleted={data.deleted}
          onRestore={handleRestore}
          onPurge={handlePurge}
          onClearTrash={handleClearTrash}
          canWrite={canWrite}
          canPurge={canPurge}
        />
      </main>
    </div>
  );
}
