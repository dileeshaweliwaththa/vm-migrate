'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { canEdit as canEditRole, isAdmin } from '@/lib/rbac';
import { computeBackupStats, formatTimestamp } from '@/lib/backup-utils';
import { useBackupTargets } from '@/hooks/backups/useBackups';
import type { UserRole } from '@/types/common';
import { BackupTargetCard } from '@/components/backups/backup-target-card';
import { BackupTargetDialog } from '@/components/backups/backup-target-dialog';

// The Backups tab.
//
// Supabase owns the configuration, the credentials and the schedule; the worker
// container owns the dumping (Edge Functions cap CPU at 2s with 256MB and have no
// mysqldump — a 64MB dump taking 245s does not fit). Each card is a target row
// plus a live read of its worker.
//
// Roles, same split as the tracker: everyone reads, editors register a target and
// run a backup, admins change a schedule, delete a dump or remove a target. The
// service layer re-checks every one of those.
export function BackupsDashboard({ role }: { role: UserRole }) {
  const canEdit = canEditRole(role);
  const canPurge = isAdmin(role);

  const { data: overviews, isLoading, error } = useBackupTargets();
  const stats = computeBackupStats(overviews ?? []);

  return (
    <>
      <PageHeader
        title="Backups"
        stats={
          <>
            <span>
              Targets: <b className="text-foreground">{stats.targets}</b>
            </span>
            {stats.unreachable ? (
              <span>
                Unreachable: <b className="text-destructive">{stats.unreachable}</b>
              </span>
            ) : null}
            <span>
              Recent backups: <b className="text-foreground">{stats.records}</b>
            </span>
            {stats.failed ? (
              <span>
                Failed: <b className="text-destructive">{stats.failed}</b>
              </span>
            ) : null}
            {/* A dump that never reached Azure is the quiet failure worth
                counting: the file exists, the off-site copy doesn't. */}
            {stats.localOnly ? (
              <span>
                Local only: <b className="text-ink-accent">{stats.localOnly}</b>
              </span>
            ) : null}
            {stats.latest ? (
              <span>
                Last: <b className="text-foreground">{formatTimestamp(stats.latest.timestamp)}</b>
              </span>
            ) : null}
          </>
        }
        actions={
          canEdit ? (
            <BackupTargetDialog
              canAdmin={canPurge}
              trigger={
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Add Target
                </Button>
              }
            />
          ) : (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Read-only
            </span>
          )
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-body-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load backup targets.'}
          </p>
        ) : (overviews ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center text-body-sm text-muted-foreground">
            No backup targets yet.
            {canEdit ? (
              <span className="mt-1 block">
                Add a MySQL server, its Azure destination and the worker that dumps it.
              </span>
            ) : null}
          </div>
        ) : (
          // One card per target, full width: each carries a history table, and
          // side by side they would both scroll horizontally.
          <div className="space-y-6">
            {(overviews ?? []).map((overview) => (
              <BackupTargetCard
                key={overview.target.id}
                overview={overview}
                canEdit={canEdit}
                canPurge={canPurge}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
