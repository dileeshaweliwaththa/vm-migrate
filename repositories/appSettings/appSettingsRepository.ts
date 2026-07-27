import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { AppSettingsRow } from '@/types/supabase/response/appSettings';

// Repository layer: data access for the `app_settings` singleton.
//
// Two read paths, by design:
//  - `findAppSettings` / `updateAppSettings` use the request-scoped server
//    client, so admin-only RLS applies (only an admin session can read/write).
//  - `findAppSettingsServiceRole` uses the service-role client to read secrets
//    for a server route whose caller may be a non-admin editor (the AI "Generate
//    by AI" flow). It bypasses RLS — only ever called from the service layer,
//    server-side, and its result never leaves the server verbatim.

export type AppSettingsWriteColumns = Partial<{
  gemini_api_key: string;
  gemini_model: string;
  ai_style_prompt: string;
}>;

export const findAppSettings = async (): Promise<AppSettingsRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AppSettingsRow | null) ?? null;
};

export const updateAppSettings = async (
  values: AppSettingsWriteColumns
): Promise<AppSettingsRow> => {
  const supabase = await createClient();
  // Upsert on the fixed singleton id so the row exists even if the seed was
  // skipped; RLS still requires an admin session for insert/update.
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ id: true, ...values }, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as AppSettingsRow;
};

export const findAppSettingsServiceRole = async (): Promise<AppSettingsRow | null> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AppSettingsRow | null) ?? null;
};
