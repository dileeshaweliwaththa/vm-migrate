import type { EnvironmentPort } from '@/types/common/project';

// Resolving an environment record into the URL it's actually reachable on.
// Pure helper, no React/DB — lives here (like lib/rbac.ts) so the docs generator
// and the UI can't derive it two different ways.

// Protocols that form a browsable URL. A TCP/UDP record is a port, not a link.
const WEB_PROTOCOLS = new Set(['HTTP', 'HTTPS', 'WS', 'WSS']);

// Ports that are implied by their scheme and shouldn't appear in the URL.
const DEFAULT_PORTS: Record<string, string> = { HTTP: '80', HTTPS: '443', WS: '80', WSS: '443' };

// The record's reachable URL, or null when it can't be formed (no domain yet, or
// a non-web protocol). Computed rather than left to the AI to guess — a made-up
// endpoint in deployment docs is worse than no endpoint.
export const recordUrl = (
  record: Pick<EnvironmentPort, 'domain' | 'port' | 'protocol'>
): string | null => {
  const domain = record.domain.trim();
  if (!domain || !WEB_PROTOCOLS.has(record.protocol)) return null;

  // Tolerate a domain that was pasted with a scheme or trailing slash already.
  const host = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
  if (!host) return null;

  const scheme = record.protocol.toLowerCase();
  const port = record.port.trim();
  if (!port || port === DEFAULT_PORTS[record.protocol]) return `${scheme}://${host}`;
  return `${scheme}://${host}:${port}`;
};
