// Domain types for admin app settings (Phase 2 · M2).
//
// Secrets never reach the browser: the public `AppSettings` shape replaces the
// raw key with a boolean "is one configured?" flag. The write-only input only
// carries a secret when the admin is actually (re)setting it — an omitted /
// undefined secret means "leave the stored value unchanged".
//
// Jenkins is configured per-environment (not here) — see types/common/jenkins.ts.

// Fallback model list for the settings dropdown when the live list from the
// Gemini API can't be fetched yet (e.g. before a key is saved). The authoritative
// list comes from the API (see aiService.listGeminiModels); this is just so the
// dropdown is never empty. First entry is the default.
export const GEMINI_MODEL_FALLBACKS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
] as const;

export const DEFAULT_GEMINI_MODEL = GEMINI_MODEL_FALLBACKS[0];

export interface AppSettings {
  geminiModel: string;
  aiStylePrompt: string;
  hasGeminiKey: boolean;
  updatedAt: string;
}

export interface AppSettingsInput {
  geminiModel?: string;
  aiStylePrompt?: string;
  // Secret — only send when changing. Empty string clears; undefined keeps.
  geminiApiKey?: string;
}

// Resolved Gemini config used server-side by the AI route (see aiService). Reads
// app_settings first, then falls back to the GEMINI_API_KEY env var (MVP).
export interface GeminiConfig {
  apiKey: string;
  model: string;
  stylePrompt: string;
}

// The Settings page's categories, in the order its menu lists them. The one
// source of truth for what `?section=` may be — add a category here, then give
// it an entry in the page's section list (components/settings/settings-manager).
export const SETTINGS_SECTIONS = ['ai', 'github'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const DEFAULT_SETTINGS_SECTION: SettingsSection = SETTINGS_SECTIONS[0];

export const isSettingsSection = (value: unknown): value is SettingsSection =>
  typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value);
