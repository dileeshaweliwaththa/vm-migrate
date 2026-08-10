import type { EnvironmentPort } from '@/types/common/project';
import type { Protocol, Vm } from '@/types/common/vm';

// Resolving an environment record into the URL it's actually reachable on.
// Pure helper, no React/DB — lives here (like lib/rbac.ts) so the docs generator
// and the UI can't derive it two different ways.

// The scheme each protocol forms a browsable URL with. Absent means "not a link":
// a TCP/UDP record is a port, not a URL. Keyed by `Protocol` rather than by string
// so the set can only ever be the enum's (AGENTS.md §types), and so both questions
// — is this a link, and how does it start — have one answer here.
const URL_SCHEME: Partial<Record<Protocol, string>> = {
  HTTP: 'http',
  HTTPS: 'https',
  WS: 'ws',
  WSS: 'wss',
};

// The same, for an address on a bare IP: the TLS variants drop to their plaintext
// scheme. TLS is terminated per *hostname* by whatever proxy fronts the domain, so
// `https://10.0.0.5:3000` would only ever be a certificate error.
const DIRECT_SCHEME: Partial<Record<Protocol, string>> = {
  HTTP: 'http',
  HTTPS: 'http',
  WS: 'ws',
  WSS: 'ws',
};

// Ports that are implied by their scheme and shouldn't appear in the URL.
const DEFAULT_PORTS: Partial<Record<Protocol, string>> = {
  HTTP: '80',
  HTTPS: '443',
  WS: '80',
  WSS: '443',
};

// Tolerate a host that was pasted with a scheme or a trailing slash already.
const bareHost = (value: string): string =>
  value
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\/+$/, '');

// The record's reachable URL, or null when it can't be formed (no domain yet, or
// a non-web protocol). Computed rather than left to the AI to guess — a made-up
// endpoint in deployment docs is worse than no endpoint.
export const recordUrl = (
  record: Pick<EnvironmentPort, 'domain' | 'port' | 'protocol'>
): string | null => {
  const scheme = URL_SCHEME[record.protocol];
  const host = bareHost(record.domain);
  if (!scheme || !host) return null;

  const port = record.port.trim();
  if (!port || port === DEFAULT_PORTS[record.protocol]) return `${scheme}://${host}`;
  return `${scheme}://${host}:${port}`;
};

// The address a VM answers on *today*: the new IP once it has been migrated onto
// it, the old one until then. A row in mid-migration carries both, and pointing
// people at an address the workload hasn't moved to yet is worse than pointing
// them at the one it is still served from. Empty when neither is filled in.
export const vmLiveIp = (vm: Pick<Vm, 'oldIp' | 'newIp' | 'migrated'>): string => {
  const oldIp = bareHost(vm.oldIp);
  const newIp = bareHost(vm.newIp);
  return vm.migrated ? newIp || oldIp : oldIp || newIp;
};

// The record's direct address on its VM — `http://10.0.0.5:3000`. The counterpart
// to recordUrl: that one is the public, DNS-fronted address, this is the host and
// port the app is actually bound to, which is what you need while a domain is
// still being pointed at it (or when the record never gets one).
//
// Null when either half is missing, or the record isn't a web endpoint. The scheme
// is always one this function chose (see DIRECT_SCHEME) and never anything from
// the stored value, which is what keeps the result safe to put in an `href` —
// see docs/security.md § Stored HTML and XSS.
export const recordLiveUrl = (
  record: Pick<EnvironmentPort, 'port' | 'protocol'>,
  vmIp: string | null
): string | null => {
  const scheme = DIRECT_SCHEME[record.protocol];
  const host = bareHost(vmIp ?? '');
  const port = record.port.trim();
  if (!scheme || !host || !port) return null;
  return `${scheme}://${host}:${port}`;
};
