// AI (Gemini) runtime status for the Settings page. Reports whether the key is
// configured and reachable, and — on a quota/rate-limit — how long until retry.
export interface GeminiStatus {
  configured: boolean;
  ok: boolean;
  quotaExceeded: boolean;
  message: string;
  retryAfterSeconds?: number;
  retryAt?: string; // ISO timestamp when a retry should be safe
}
