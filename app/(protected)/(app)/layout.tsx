import { redirect } from 'next/navigation';
import { getCurrentUser, getCurrentRole } from '@/services/auth/authService';
import { AppShell } from '@/components/layout/app-shell';

// Layout for the shell-based app pages (dashboard, projects, admin). The
// full-screen VM tracker lives outside this group and keeps its own chrome.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const role = (await getCurrentRole()) ?? 'viewer';

  return (
    <AppShell role={role} email={user.email ?? ''}>
      {children}
    </AppShell>
  );
}
