import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Service-role client for the rare server-side routes that have no cookie
 * session to build the normal `lib/supabase/server.ts` client from (e.g. a
 * webhook authenticated by a shared secret instead of a browser session).
 *
 * Bypasses Row Level Security — NEVER use this for a request that already has
 * an authenticated user; use `createClient()` from `lib/supabase/server.ts`
 * for that. Only ever imported by the repository layer.
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }
  return createSupabaseClient(env.supabaseUrl, serviceRoleKey);
}
