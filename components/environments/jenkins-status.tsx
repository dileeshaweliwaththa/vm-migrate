import type { JenkinsBuildStatus } from '@/types/common/jenkins';

// Shared Jenkins build-status pill (used by the browse-jobs dialog and the
// environment records table) so the two render status identically.
const STATUS_CLASS: Record<JenkinsBuildStatus, string> = {
  SUCCESS: 'text-emerald-600 dark:text-emerald-500',
  FAILED: 'text-destructive',
  UNSTABLE: 'text-amber-600 dark:text-amber-500',
  ABORTED: 'text-muted-foreground',
  DISABLED: 'text-muted-foreground',
  NOT_BUILT: 'text-muted-foreground',
  PENDING: 'text-muted-foreground',
  BUILDING: 'text-sky-600 dark:text-sky-400',
  UNKNOWN: 'text-muted-foreground',
};

export function JenkinsStatusBadge({
  status,
  building,
}: {
  status: JenkinsBuildStatus;
  building: boolean;
}) {
  const label = building ? 'BUILDING' : status;
  const cls = building ? STATUS_CLASS.BUILDING : STATUS_CLASS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cls}`}>
      <span className={`size-2 rounded-full bg-current ${building ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
