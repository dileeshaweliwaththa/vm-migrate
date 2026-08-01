import type { JenkinsBuildStatus, JenkinsRunPhase } from '@/types/common/jenkins';

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
  label,
  title,
}: {
  status: JenkinsBuildStatus;
  building: boolean;
  // Overrides the text for states Jenkins' own status set doesn't name — a run
  // waiting in the queue, or one cancelled before it started. Colour still comes
  // from `status`, so the pill stays consistent with the rest.
  label?: string;
  title?: string;
}) {
  const text = label ?? (building ? 'BUILDING' : status);
  const cls = building ? STATUS_CLASS.BUILDING : STATUS_CLASS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${cls}`}
      title={title}
    >
      <span className={`size-2 rounded-full bg-current ${building ? 'animate-pulse' : ''}`} />
      {text}
    </span>
  );
}

// The same pill for a *run* — a live poll or a recorded one — so a row that is
// following a build and the build history render it identically. Jenkins' status
// set has no word for "waiting in the queue" or "cancelled before it started",
// hence the labels.
export function JenkinsRunBadge({
  phase,
  result,
  title,
}: {
  phase: JenkinsRunPhase;
  result: JenkinsBuildStatus | null;
  title?: string;
}) {
  switch (phase) {
    case 'QUEUED':
      return <JenkinsStatusBadge status="PENDING" building={false} label="QUEUED" title={title} />;
    case 'RUNNING':
      return <JenkinsStatusBadge status="BUILDING" building title={title} />;
    case 'DONE':
      return <JenkinsStatusBadge status={result ?? 'UNKNOWN'} building={false} title={title} />;
    case 'CANCELLED':
      return (
        <JenkinsStatusBadge status="ABORTED" building={false} label="CANCELLED" title={title} />
      );
    case 'UNKNOWN':
      return <JenkinsStatusBadge status="UNKNOWN" building={false} title={title} />;
  }
}
