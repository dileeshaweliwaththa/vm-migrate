import { redirect } from 'next/navigation';
import { getCurrentActor } from '@/services/auth/authService';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { CurrentDate } from '@/components/layout/current-date';
import { ThemeToggle } from '@/components/layout/theme-toggle';

// Shell for every app page (dashboard, projects, admin, and the VM tracker): a
// collapsible left sidebar + a top bar holding the collapse trigger, the
// breadcrumb trail, today's date and the theme toggle.
//
// Identity lives in **one** place: the sidebar footer's account menu, which also
// owns sign-out. The top bar deliberately has none — it used to carry a second
// copy of the same name and role.
//
// `getCurrentActor()` rather than `getCurrentUser()` + `getCurrentRole()` — it
// resolves identity, role *and* the profile name in one read instead of two, and
// the name is what both places display.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getCurrentActor();
  if (!actor) redirect('/login');

  return (
    // 280px rather than the primitive's 16rem default, per the design. The
    // provider spreads `style` *after* its own custom properties, so this wins.
    <SidebarProvider style={{ '--sidebar-width': '280px' } as React.CSSProperties}>
      <AppSidebar role={actor.role} name={actor.name} email={actor.email} />
      {/* `min-w-0` is load-bearing. SidebarInset is a flex item, so it defaults to
          `min-width: auto` and refuses to shrink below its content's min-content
          width. A wide child — the tracker's `min-w-[1800px]` table — would then
          widen the whole page instead of scrolling inside its own container, and
          the sticky top bar and page header would slide sideways with the body.
          Same failure as the DialogContent grid trap in docs/ui-guidelines.md. */}
      <SidebarInset className="min-w-0">
        {/* The design's one piece of texture: a 24px dot lattice at 3% behind the
            page, which is what keeps the flat, shadowless cards from floating on
            nothing. Decorative and inert; `inset-0` covers the inset's whole
            scroll height because SidebarInset is `relative`. */}
        <div aria-hidden className="canvas-grid pointer-events-none absolute inset-0 z-0" />

        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-8">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          {/* `w-px` is supplied here because the primitive can't. `ui/separator.tsx`
              puts *all* of its sizing on `data-horizontal:` / `data-vertical:` —
              Radix 2.x boolean attributes — and 1.4.3 emits `data-orientation`
              instead, so the width never lands and the divider is zero-area. Third
              casualty of that trap, alongside Switch and Tabs; see
              docs/ui-guidelines.md. */}
          <Separator orientation="vertical" className="mr-2 h-4 w-px" />
          <Breadcrumbs />
          {/* No account control here — identity and sign-out live in the sidebar
              footer, in one place. */}
          <div className="ml-auto flex items-center gap-3">
            <CurrentDate />
            <ThemeToggle />
          </div>
        </header>

        {/* Above the texture. Its own stacking context, so the page's sticky
            headers keep working inside it. */}
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
