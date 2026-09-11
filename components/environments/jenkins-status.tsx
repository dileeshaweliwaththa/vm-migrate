import { cn } from '@/lib/utils';
import type { JenkinsBuildStatus, JenkinsRunPhase } from '@/types/common/jenkins';

// Shared Jenkins build-status pill (used by the browse-jobs dialog and the
// environment records table) so the two render status identically.
//
// A filled pill rather than bare text, per the design: "small, uppercase labels
// … low-opacity backgrounds of the status colour with high-contrast text". The
// fills are the `tone-*` tokens from globals.css, so they're themed per mode and
// no call site here names a colour. Every pill still carries its status as text —
// the hue is a second channel, never the only one.
const STATUS_CLASS: Record<JenkinsBuildStatus, string> = {
  SUCCESS: 'bg-tone-success text-tone-success-fg',
  FAILED: 'bg-tone-danger text-tone-danger-fg',
  UNSTABLE: 'bg-tone-warning text-tone-warning-fg',
  ABORTED: 'bg-muted text-muted-foreground',
  DISABLED: 'bg-muted text-muted-foreground',
  NOT_BUILT: 'bg-muted text-muted-foreground',
  PENDING: 'bg-tone-warning text-tone-warning-fg',
  BUILDING: 'bg-tone-info text-tone-info-fg',
  UNKNOWN: 'bg-muted text-muted-foreground',
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
    // `cn()` rather than a template literal (UI guidelines rule 5): the tone
    // classes carry both a fill and a text colour, and interpolation gives up the
    // merge safety net that keeps a later override from landing alongside them.
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-0.5 text-label-caps font-bold uppercase',
        cls
      )}
      title={title}
    >
      {/* The dot inherits the pill's text colour, so the two can't drift. It
          pulses only while a build is actually in flight. */}
      <span className={cn('size-1.5 shrink-0 rounded-full bg-current', building && 'animate-pulse')} />
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
