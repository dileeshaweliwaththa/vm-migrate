import { getCurrentRole } from '@/services/auth/authService';
import {
  findAppSettings,
  updateAppSettings,
  findAppSettingsServiceRole,
  type AppSettingsWriteColumns,
} from '@/repositories/appSettings/appSettingsRepository';
import type { ApiResponse, ApiSingleResponse } from '@/types/common';
import type { AppSettings, AppSettingsInput, GeminiConfig } from '@/types/common/settings';
import type { AppSettingsRow } from '@/types/supabase/response/appSettings';

// Service layer: admin app settings. Every entry point re-checks the caller is
// an admin against their real session before touching the repository (RLS is
// authoritative too). Secrets are masked out of every value returned to a
// client; only `getGeminiConfig` (server-side, service-role) resolves the real
// key, and its result is used to call Gemini — never returned to the browser.

const DEFAULT_MODEL = 'gemini-2.5-flash';

const requireAdmin = async (): Promise<ApiResponse | null> => {
  const role = await getCurrentRole();
  if (role !== 'admin') return { success: false, message: 'Admin access required.' };
  return null;
};

// Maps a raw row to the public, secret-free settings shape.
const toPublic = (row: AppSettingsRow | null): AppSettings => ({
  geminiModel: row?.gemini_model || DEFAULT_MODEL,
  aiStylePrompt: row?.ai_style_prompt ?? '',
  hasGeminiKey: Boolean(row?.gemini_api_key),
  updatedAt: row?.updated_at ?? '',
});

const asError = (error: unknown, fallback: string): string =>
  (error instanceof Error && error.message) || fallback;

export const getSettings = async (): Promise<ApiSingleResponse<AppSettings>> => {
  const denied = await requireAdmin();
  if (denied) return { ...denied, data: null };
  try {
    const row = await findAppSettings();
    return { success: true, message: 'OK', data: toPublic(row) };
  } catch (error) {
    return { success: false, message: asError(error, 'Failed to load settings.'), data: null };
  }
};

export const saveSettings = async (
  input: AppSettingsInput
): Promise<ApiSingleResponse<AppSettings>> => {
  const denied = await requireAdmin();
  if (denied) return { ...denied, data: null };

  const cols: AppSettingsWriteColumns = {};
  if (input.geminiModel !== undefined) cols.gemini_model = input.geminiModel.trim() || DEFAULT_MODEL;
  if (input.aiStylePrompt !== undefined) cols.ai_style_prompt = input.aiStylePrompt;
  // Secret: only write when provided (undefined = keep stored value).
  if (input.geminiApiKey !== undefined) cols.gemini_api_key = input.geminiApiKey.trim();

  try {
    const row = await updateAppSettings(cols);
    return { success: true, message: 'Settings saved.', data: toPublic(row) };
  } catch (error) {
    return { success: false, message: asError(error, 'Failed to save settings.'), data: null };
  }
};

// Server-side only. Resolves the Gemini config for the AI route: the stored key
// first, then the GEMINI_API_KEY env var as an MVP fallback (see plan §7).
// Reads via the service-role repo so a non-admin editor running "Generate by
// AI" can use the key without ever being able to read it.
export const getGeminiConfig = async (): Promise<GeminiConfig | null> => {
  let row: AppSettingsRow | null = null;
  try {
    row = await findAppSettingsServiceRole();
  } catch {
    row = null; // service-role unavailable — fall through to env var
  }
  const apiKey = (row?.gemini_api_key || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: row?.gemini_model || DEFAULT_MODEL,
    stylePrompt: row?.ai_style_prompt ?? '',
  };
};
