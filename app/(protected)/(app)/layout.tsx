import { redirect } from 'next/navigation';
import { getCurrentActor } from '@/services/auth/authService';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { CurrentDate } from '@/components/layout/current-date';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';

// Shell for every app page (dashboard, projects, admin, and the VM tracker): a
// collapsible left sidebar + a top bar holding the collapse trigger, today's
// date, the theme toggle and the account menu.
//
// Identity is split deliberately: the **top bar** owns the clickable account menu
// and sign-out, while the sidebar shows the same name and role as plain text.
//
// `getCurrentActor()` rather than `getCurrentUser()` + `getCurrentRole()` — it
// resolves identity, role *and* the profile name in one read instead of two, and
// the name is what both places display.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getCurrentActor();
  if (!actor) redirect('/login');

  return (
    <SidebarProvider>
      <AppSidebar role={actor.role} name={actor.name} email={actor.email} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="ml-auto flex items-center gap-2">
            <CurrentDate />
            <ThemeToggle />
            <Separator orientation="vertical" className="h-6" />
            <UserMenu role={actor.role} name={actor.name} email={actor.email} />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
