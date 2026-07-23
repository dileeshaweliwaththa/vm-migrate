import { redirect } from 'next/navigation';
import { getCurrentUser, getCurrentRole } from '@/services/auth/authService';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { ThemeToggle } from '@/components/layout/theme-toggle';

// Shell for every app page (dashboard, projects, admin, and the VM tracker):
// a collapsible left sidebar + a thin top bar with the collapse trigger and
// theme toggle. One consistent layout across the whole app.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const role = (await getCurrentRole()) ?? 'viewer';

  return (
    <SidebarProvider>
      <AppSidebar role={role} email={user.email ?? ''} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
