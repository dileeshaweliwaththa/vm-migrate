import { createClient } from '@/lib/supabase/server';

// Repository layer: pure Supabase data access. No business rules — just
// queries and auth calls that return raw results to the service layer.

export const signInWithOtp = async (email: string, shouldCreateUser = true, name?: string) => {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser,
      // Lands in auth.users.raw_user_meta_data; the handle_new_user trigger
      // copies it into profiles.name on account creation.
      ...(name ? { data: { name } } : {}),
    },
  });
  return { error };
};

export const verifyEmailOtp = async (email: string, token: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  return { user: data?.user ?? null, error };
};

export const signOut = async () => {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getAuthenticatedUser = async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
};
