import { createServiceClient } from '@/lib/supabase/service';
import type { UserRole } from '@/types/common';

// Repository layer: admin-only user management via the service-role client
// (bypasses RLS to create/delete auth users). Only ever called from
// userService, which enforces the admin check first. See lib/supabase/service.ts.

export const adminListProfiles = async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const adminCreateAuthUser = async (email: string, name?: string) => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(name ? { user_metadata: { name } } : {}),
  });
  return { user: data?.user ?? null, error };
};

export const adminUpsertProfile = async (
  id: string,
  email: string,
  name: string | undefined,
  role: UserRole
) => {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('profiles')
    .upsert({ id, email, name: name ?? null, role }, { onConflict: 'id' });
  return { error };
};

export const adminUpdateRole = async (id: string, role: UserRole) => {
  const supabase = createServiceClient();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  return { error };
};

export const adminDeleteAuthUser = async (id: string) => {
  const supabase = createServiceClient();
  const { error } = await supabase.auth.admin.deleteUser(id);
  return { error };
};
