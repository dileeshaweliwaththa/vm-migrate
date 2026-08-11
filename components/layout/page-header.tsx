import { cn } from '@/lib/utils';

// Shared page title block, in the design system's two forms.
//
// **Default (`sticky={false}`) — the hero.** What the design shows: a 36px
// uppercase display title sitting directly on the content canvas, an optional
// stats line led by an accent dot, and right-aligned actions baseline-aligned with
// the title. No border, no fill — the breadcrumb in the top bar is what carries
// "where am I" once this scrolls away.
//
// **`sticky` — the pinned bar.** For a page whose numbers have to stay on screen
// while a long table scrolls (the VM tracker). Same content, denser: the title
// drops to 24px and the block gains the bar chrome and pins under the 64px top
// bar. Nothing else should need this — prefer the hero.
//
// Server-safe (no client hooks).
export function PageHeader({
  title,
  stats,
  actions,
  sticky = false,
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
        // `md:items-center`, not `items-end`: the actions sit vertically centred
        // against the whole title block (title + stats line) rather than dropping
        // to its baseline, where they read as belonging to the stats row. Still
        // right-aligned — `justify-between` is what keeps them there.
        'flex flex-col justify-between gap-4 px-4 md:flex-row md:items-center sm:px-8',
        sticky
          ? 'sticky top-16 z-20 border-b border-border bg-background/80 py-3 backdrop-blur-md'
          : // Tight to the top bar's border. The 36px title already carries plenty
            // of visual weight, so 32px above it read as a gap rather than as
            // breathing room; the page body below still supplies its own py-8.
            'pt-4',
        className
      )}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            'font-display uppercase',
            sticky ? 'text-headline-lg' : 'text-headline-xl'
          )}
        >
          {title}
        </h1>
        {stats != null ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted-foreground">
            {/* The accent, marking the live summary. Decorative — every stat
                beside it is already labelled in text. */}
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent-step" />
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
