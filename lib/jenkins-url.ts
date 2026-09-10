// Jenkins URL handling, in one place because every URL Jenkins reports has to be
// treated as untrusted *and* as possibly pointing at the wrong host.
//
// Jenkins builds the absolute URLs in its API responses — `job.url`, the queue
// item in a trigger's `Location` header, `executable.url` — from its own global
// "Jenkins URL" setting (Manage Jenkins → System → Jenkins Location), **not**
// from the address the request actually arrived on. The two disagree whenever
// that setting is stale: a VM that moved to a new IP, a server put behind a
// proxy, a renamed host. Jenkins then answers a request made to
// `http://20.197.41.68:8080` with jobs at `http://20.204.129.96:8080/job/…`.
//
// Left alone, that stale host is what gets stored on a record
// (`endpoints.jenkins_job_url`), what the row's job link opens, and what
// ▶ Run posts back — where the SSRF guard correctly refuses it ("That job URL
// doesn't belong to this Jenkins server"). So every URL that comes *from* Jenkins
// or out of a stored record is re-mounted on the base the environment is actually
// configured with, keeping only its path. See docs/jenkins-sync.md.

import { isDeniedOutboundTarget, normalizeServiceUrl } from '@/lib/outbound-url';

// Derives the Jenkins server root from a job URL (handles context paths and plain
// roots): everything before "/job/", else the URL itself.
export const deriveJenkinsBase = (jenkinsUrl: string): string => {
  const trimmed = jenkinsUrl.trim().replace(/\/+$/, '');
  const idx = trimmed.indexOf('/job/');
  return idx > -1 ? trimmed.slice(0, idx) : trimmed;
};

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null; // not an absolute URL
  }
};

// Is `candidate` a URL on the *same* Jenkins server as `base` — same origin, at
// or below its context path? Every request built from a client-supplied URL
// carries this environment's Basic-auth token, so this is the guard that keeps
// the token from being sent anywhere else.
//
// A plain `candidate.startsWith(base)` is not enough: with a base of
// `https://jenkins.corp` the URL `https://jenkins.corp.attacker.test/job/x`
// passes it, and the token would be handed to that host. Compare parsed origins
// instead, which also pins the scheme and port.
// Jenkins' own default, and what every server in this fleet runs on. A VM's
// Jenkins address is therefore almost always "the VM's IP" — so that is all the
// form asks for, and this fills in the rest.
export const DEFAULT_JENKINS_PORT = '8080';

// Turns what someone types into a server root: `20.197.41.68` becomes
// `http://20.197.41.68:8080`. Shared with the backup services, which do the same
// thing with their own default port — see `normalizeServiceUrl`.
export const normalizeJenkinsServerUrl = (value: string): string =>
  normalizeServiceUrl(value, DEFAULT_JENKINS_PORT);

export const isSameJenkinsServer = (candidate: string | undefined, base: string): boolean => {
  if (!candidate || !base) return false;

  const target = parseUrl(candidate);
  const root = parseUrl(base);
  if (!target || !root) return false;

  if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
  // `URL.origin` ignores userinfo, so reject it explicitly rather than let a
  // `https://user:pass@host/` form through.
  if (target.username || target.password) return false;
  if (target.origin !== root.origin) return false;

  // Honour a context path (e.g. https://host/jenkins): the target must sit at or
  // under it, with a boundary check so `/jenkinsX` can't pass as `/jenkins`.
  const rootPath = root.pathname.replace(/\/+$/, '');
  const targetPath = target.pathname.replace(/\/+$/, '');
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);
};

// The host denylist and the parse rules are shared with the backup-service
// integration — see `lib/outbound-url.ts`. This name stays because every caller
// in the Jenkins slice reads better for it, and because the guard's meaning here
// is specific: *this* is the check that stands between a client-supplied URL and
// an outbound request carrying an API token.
export const isDeniedJenkinsTarget = (url: string): boolean => isDeniedOutboundTarget(url);

// Where a Jenkins path begins, for the case where the reported URL carries a
// different context path than the one we connect through — splice there so the
// two paths are never concatenated into `/jenkins/jenkins/job/…`.
const PATH_ANCHOR = /\/(?:job|queue|view|blue)\//;

// Re-mounts a URL Jenkins gave us (or one stored from an earlier session) on the
// server root this environment is configured with, keeping only its path. A URL
// that already lives on that server comes back unchanged, so this is safe to
// apply to everything rather than only to known-stale values.
//
// It is also what makes the SSRF guard hold without rejecting the user's own
// records: the result's origin is always `base`'s, so the token can only ever be
// sent to the server the environment points at.
export const rebaseOnJenkinsServer = (url: string, base: string): string => {
  const candidate = url.trim();
  if (!candidate) return '';

  const root = parseUrl(deriveJenkinsBase(base));
  if (!root) return candidate; // no usable base — nothing to re-mount onto

  const target = parseUrl(candidate);
  // Jenkins can also answer with a relative Location; treat it as a path.
  const path = target
    ? `${target.pathname}${target.search}`
    : candidate.startsWith('/')
      ? candidate
      : `/${candidate}`;

  const rootPath = root.pathname.replace(/\/+$/, '');
  const anchor = path.search(PATH_ANCHOR);
  const suffix =
    path === rootPath || path.startsWith(`${rootPath}/`)
      ? path.slice(rootPath.length)
      : anchor > -1
        ? path.slice(anchor)
        : path;

  return `${root.origin}${rootPath}${suffix}`;
};
