'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Cable, Layers, Search, Settings2, Table2 } from 'lucide-react';
import { useTrackerData } from '@/hooks/vms/useVmTracker';
import { vmLiveIp } from '@/lib/endpoints';
import { VM_OWNERSHIP_FILTERS, type Vm, type VmGroup, type VmOwnershipFilter } from '@/types/common/vm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PageHeader } from '@/components/layout/page-header';

const FILTER_LABEL: Record<VmOwnershipFilter, string> = {
  all: 'All',
  upview: 'UPVIEW',
  client: 'Client',
};

const matchesOwnership = (vm: Vm, filter: VmOwnershipFilter): boolean =>
  filter === 'all' || (filter === 'client') === vm.isClient;

// The VMs page (docs/vms.md): every machine in service as a card, shaped like the
// Projects page, with the migration grid one click away. Reads the tracker's own
// payload, so this list and the tracker share one cache and can't disagree.
// Trashed VMs aren't listed — the trash belongs to the tracker.
export function VmsDashboard() {
  const { data, isLoading, error } = useTrackerData();
  const [filter, setFilter] = useState<VmOwnershipFilter>('all');
  const [search, setSearch] = useState('');

  const vms = useMemo(() => data?.vms ?? [], [data]);
  const groupsById = useMemo(
    () => new Map((data?.groups ?? []).map((g) => [g.id, g])),
    [data]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vms
      .filter((vm) => matchesOwnership(vm, filter))
      .filter((vm) => {
        if (!term) return true;
        const group = vm.groupId ? groupsById.get(vm.groupId)?.name ?? '' : '';
        const haystack = [vm.name, vm.oldIp, vm.newIp, group, ...vm.ips.map((ip) => ip.address)];
        return haystack.join(' ').toLowerCase().includes(term);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [vms, filter, search, groupsById]);

  const clientCount = vms.filter((vm) => vm.isClient).length;
  const migratedCount = vms.filter((vm) => vm.migrated).length;

  return (
    <>
      <PageHeader
        title="VMs"
        stats={
          <>
            <span>
              VMs: <b className="text-foreground">{vms.length}</b>
            </span>
            <span>
              UPVIEW: <b className="text-foreground">{vms.length - clientCount}</b>
            </span>
            <span>
              Client: <b className="text-foreground">{clientCount}</b>
            </span>
            <span>
              Migrated:{' '}
              <b className="text-foreground">
                {migratedCount} / {vms.length}
              </b>
            </span>
          </>
        }
        actions={
          <Button size="sm" asChild>
            <Link href="/tracker">
              <Table2 className="mr-2 h-4 w-4" /> VM Tracker
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* `ToggleGroup`, not `ui/tabs` — same reason as the projects tag
              filter (docs/ui-guidelines.md), and styled the same so the two
              pages read as one design. */}
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as VmOwnershipFilter)}
            className="flex-wrap justify-start gap-1 rounded-sm border border-border bg-muted p-1"
          >
            {VM_OWNERSHIP_FILTERS.map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className="rounded-sm px-3 text-body-sm data-[state=on]:bg-card data-[state=on]:font-medium data-[state=on]:text-foreground"
              >
                {FILTER_LABEL[key]}
                <span className="font-mono text-label-mono text-muted-foreground">
                  {vms.filter((vm) => matchesOwnership(vm, key)).length}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, IP or group…"
              className="pl-8"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-body-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load VMs.'}
          </p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center text-body-sm text-muted-foreground">
            {vms.length === 0 ? (
              <>
                No VMs yet — add one in the{' '}
                <Link href="/tracker" className="font-medium text-foreground underline-offset-4 hover:underline">
                  VM Tracker
                </Link>
                .
              </>
            ) : (
              'No VMs match this filter.'
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((vm) => (
              <VmCard
                key={vm.id}
                vm={vm}
                group={vm.groupId ? groupsById.get(vm.groupId) ?? null : null}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// A chip in the card footer: an icon and a count, in the same mono treatment as
// the projects page's environment tally.
function Tally({ icon: Icon, label }: { icon: typeof Layers; label: string }) {
  return (
    <Badge
      variant="outline"
      className="rounded-sm bg-muted/50 px-1.5 font-mono text-label-mono font-medium text-muted-foreground"
    >
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function VmCard({ vm, group }: { vm: Vm; group: VmGroup | null }) {
  const liveIp = vmLiveIp(vm);
  const environmentCount = new Set(vm.urls.map((u) => u.environmentId).filter(Boolean)).size;

  return (
    <Link href={`/vms/${vm.id}`} className="block">
      {/* Hover shifts the border, not the shadow — the same interaction rule as
          the project cards. */}
      <Card className="h-full rounded-lg shadow-none transition-colors hover:border-input">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-headline-md tracking-normal break-all">{vm.name || 'Unnamed VM'}</CardTitle>
          <div className="flex flex-wrap gap-1 pt-1">
            <Badge variant="outline" className="rounded-sm text-label-caps font-bold uppercase">
              {vm.isClient ? 'Client' : 'UPVIEW'}
            </Badge>
            {group ? (
              <Badge variant="outline" className="rounded-sm text-label-caps font-bold uppercase">
                {group.name}
              </Badge>
            ) : null}
            <Badge variant={vm.migrated ? 'secondary' : 'outline'} className="rounded-sm text-label-caps uppercase">
              {vm.migrated ? 'Migrated' : 'Not migrated'}
            </Badge>
            {vm.isSupabase ? (
              <Badge variant="outline" className="rounded-sm text-label-caps uppercase">
                Supabase
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-mono text-label-mono text-ink-source">
            {liveIp || 'No address yet'}
            {vm.ips.length ? (
              <span className="text-muted-foreground"> · +{plural(vm.ips.length, 'address')}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Tally icon={Cable} label={plural(vm.urls.length, 'endpoint')} />
            <Tally icon={Layers} label={plural(environmentCount, 'environment')} />
            {vm.jenkins ? <Tally icon={Settings2} label="Jenkins" /> : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
