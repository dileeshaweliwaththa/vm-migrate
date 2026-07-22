import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/services/auth/authService';

// Route guard for every screen under (protected): unauthenticated visitors are
// bounced to the login page before any protected UI renders.
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <>{children}</>;
}
