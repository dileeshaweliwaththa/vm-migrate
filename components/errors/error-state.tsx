import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// The one shape every "this didn't work" screen takes: the route error, the
// in-shell 404, the root 404, the last-resort global error and the inline panel
// boundary. An icon, a sentence saying what happened, one saying what to do, and
// the actions that do it.
//
// `reference` is the error's `digest`: the id the server logged it under. In
// production a server error's message is replaced by a generic one so nothing
// sensitive reaches the browser, so the digest is the only thing worth quoting to
// whoever reads the logs.
//
// Server-safe (no client hooks), so the 404 pages render it on the server.
export function ErrorState({
  icon: Icon,
  title,
  description,
  reference,
  actions,
  compact = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  reference?: string;
  actions?: React.ReactNode;
  // Inline in a panel or dialog rather than filling a page.
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border text-center',
        compact ? 'px-4 py-6' : 'mx-auto max-w-lg px-6 py-12',
        className
      )}
    >
      <Icon className={cn('text-muted-foreground', compact ? 'size-5' : 'size-8')} aria-hidden />
      <div className="space-y-1">
        <p className={cn('font-semibold text-foreground', compact ? 'text-body-sm' : 'text-body-md')}>
          {title}
        </p>
        <p className="text-body-sm text-muted-foreground">{description}</p>
      </div>
      {reference ? (
        <p className="font-mono text-label-mono text-muted-foreground">Reference: {reference}</p>
      ) : null}
      {actions ? <div className="flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
