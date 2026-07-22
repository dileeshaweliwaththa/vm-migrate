
import { createClient } from './client';

export const getUserEmail = async () => {
  const supabase =  await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error('Failed to fetch user data');
  } 
  return data.user.email;
}


