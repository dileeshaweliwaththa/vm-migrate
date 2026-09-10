// Shared rules for the URLs this app fetches on the server's behalf.
//
// Two integrations reach outward — Jenkins (`lib/jenkins-url.ts`) and the backup
// services (`services/backups/backupService.ts`) — and both build requests from
// an address an editor typed in. The denylist and the "just give me the host"
// normalizer therefore live here rather than being copied per feature: a
// denylist that exists twice is a denylist that will be updated once.
//
// See docs/security.md § SSRF.

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null; // not an absolute URL
  }
};

// Hosts the app refuses to fetch, whatever the credentials, and the first thing
// an SSRF probe reaches for.
//
// Deliberately narrow. This tool exists to reach build servers and database
// hosts on internal networks, so private ranges (10/8, 172.16/12, 192.168/16)
// stay allowed — blocking them would break the product. What is refused is the
// link-local range, which carries the cloud instance-metadata endpoints
// (169.254.169.254 on AWS/Azure, metadata.google.internal on GCP) and answers
// none of our integrations, plus the unspecified address.
const isDeniedHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '0.0.0.0' || host === '::' || host === '::0') return true;
  if (host === 'metadata.google.internal') return true;
  // IPv4 link-local (169.254.0.0/16) and IPv6 link-local (fe80::/10).
  if (/^169\.254\./.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  return false;
};

// Is this URL one the app must refuse to fetch? Returns false for a URL it
// cannot parse — the callers already reject those on their own terms, and this
// predicate answers only the question it is named for.
export const isDeniedOutboundTarget = (url: string): boolean => {
  const parsed = parseUrl(url.trim());
  return parsed ? isDeniedHostname(parsed.hostname) : false;
};

// Turns what someone types into a service root: with a default port of 8080,
// `20.197.41.68` becomes `http://20.197.41.68:8080`. A scheme, a port or a
// context path that is already there is kept, and a trailing slash is dropped so
// the result concatenates cleanly with a path.
//
// The port default applies to `http` only: an `https` service is behind a proxy
// on 443, and forcing a port onto it would break a working address.
export const normalizeServiceUrl = (value: string, defaultPort: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = parseUrl(withScheme);
  // Unparseable input is handed back as typed rather than mangled — the denylist
  // check and the service itself will reject it, with a message about the
  // address.
  if (!parsed) return withScheme.replace(/\/+$/, '');

  if (!parsed.port && parsed.protocol === 'http:') parsed.port = defaultPort;
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
};
