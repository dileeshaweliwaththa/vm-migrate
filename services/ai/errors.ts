// Translates raw Gemini/@google/genai errors into short, user-facing messages.
// The SDK throws errors whose `.message` is a big JSON blob; we never surface
// that directly. Detects the common cases (quota/rate-limit, retired/unknown
// model, bad key) and pulls out the retry delay when present.

export interface GeminiErrorInfo {
  message: string;
  quotaExceeded: boolean;
  retryAfterSeconds?: number;
}

const truncate = (s: string, max = 240): string =>
  s.length > max ? `${s.slice(0, max).trim()}…` : s;

// Pulls the first {...} JSON object out of a message and parses it, if any.
const extractJson = (raw: string): { error?: { message?: string; status?: string; code?: number; details?: unknown[] } } | null => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const parseRetrySeconds = (raw: string): number | undefined => {
  const m = raw.match(/retryDelay"?\s*:?\s*"?([\d.]+)s/i) ?? raw.match(/retry in ([\d.]+)s/i);
  if (!m) return undefined;
  const secs = Math.ceil(parseFloat(m[1]));
  return Number.isFinite(secs) && secs > 0 ? secs : undefined;
};

export const humanizeSeconds = (s: number): string => {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
};

export const interpretGeminiError = (error: unknown): GeminiErrorInfo => {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const json = extractJson(raw);
  const status = json?.error?.status ?? '';
  const code = json?.error?.code;

  // Quota / rate limit.
  if (status === 'RESOURCE_EXHAUSTED' || code === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(raw)) {
    const secs = parseRetrySeconds(raw);
    const when = secs ? ` Try again in about ${humanizeSeconds(secs)}.` : ' Please try again shortly.';
    return {
      message: `Gemini quota/rate limit reached.${when} If it keeps happening, check your Google AI plan & billing.`,
      quotaExceeded: true,
      retryAfterSeconds: secs,
    };
  }

  // Retired / unknown model.
  if (status === 'NOT_FOUND' || code === 404 || /no longer available|not found|is not supported/i.test(raw)) {
    return {
      message: 'That Gemini model isn’t available for your key. Pick another from the Model dropdown (Reload the list).',
      quotaExceeded: false,
    };
  }

  // Bad / rejected key.
  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED|unauthenticated|invalid authentication/i.test(raw)) {
    return {
      message: 'The Gemini API key was rejected. Check the key in Settings.',
      quotaExceeded: false,
    };
  }

  // Fallback: prefer the parsed error.message, else a truncated raw string.
  const message = json?.error?.message?.trim() || raw || 'Gemini request failed.';
  return { message: truncate(message), quotaExceeded: false };
};
