import { cn } from '@/lib/utils';

// Shared page top-bar: an uppercase title with an optional stats line and
// right-aligned actions. Sits below the app header (h-14) and matches the VM
// tracker's header. Sticky by default. Server-safe (no client hooks).
export function PageHeader({
  title,
  stats,
  actions,
  sticky = true,
  className,
}: {
  title: string;
  stats?: React.ReactNode;
  actions?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background/95 px-6 py-3 backdrop-blur',
        sticky && 'sticky top-14 z-20',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-bold uppercase tracking-tight">{title}</h1>
        {stats != null ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {stats}
          </div>
        ) : null}
      </div>
      {actions != null ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
