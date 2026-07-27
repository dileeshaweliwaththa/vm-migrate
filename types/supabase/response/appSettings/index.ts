// Raw `app_settings` row. Includes the secret columns — this shape only ever
// exists server-side (repository/service); it is never sent to the browser.
export interface AppSettingsRow {
  id: boolean;
  gemini_api_key: string;
  gemini_model: string;
  ai_style_prompt: string;
  created_at: string;
  updated_at: string;
}
