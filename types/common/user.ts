import type { UserRole } from '@/types/common';

// A provisioned application user, as shown in the admin user-management screen.
export interface AppUser {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  createdAt: string;
}
