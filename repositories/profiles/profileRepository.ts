import { createClient } from '@/lib/supabase/server';
import type { Profiles } from '@/types/supabase/response/profiles';

// Repository layer: pure Supabase data access for the `profiles` table.

export const findProfileByEmail = async (email: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  return data;
};

export const findProfileById = async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', id)
    .maybeSingle();
  return data as Profiles | null;
};

export const findRoleById = async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', id)
    .maybeSingle();
  return data?.role ?? null;
};
