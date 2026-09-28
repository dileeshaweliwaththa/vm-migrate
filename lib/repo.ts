// Source-repository helpers — how a record's repository is stored, labelled and
// linked. Shared by the service (which cleans the value before it is written, and
// what Jenkins reports before it reaches the browser) and the records table.

// A clone URL can carry credentials — `https://user:token@github.com/…` is how a
// token is commonly wired into a Jenkins job. The userinfo is dropped wherever a
// repository URL is stored or sent to the browser; it's never needed to *show*
// the repository. SCP-style `git@host:org/repo` is left alone: `git@` is the SSH
// login name, not a secret, and it isn't a `scheme://` URL.
export const stripRepoCredentials = (value: string): string =>
  value.trim().replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1');

const HOST = /^[a-z0-9.-]+(:\d+)?$/i;

// Host and path of a repository, whichever form it was written in:
//   https://github.com/org/repo(.git)   ssh://git@github.com:22/org/repo.git
//   git@github.com:org/repo.git         github.com/org/repo      org/repo
// A bare `org/repo` is taken as GitHub — that's where this team's repositories
// live. Null for anything that doesn't reduce to a host and a path.
const repoParts = (value: string): { host: string; path: string } | null => {
  const raw = stripRepoCredentials(value);
  if (!raw) return null;

  let host = '';
  let path = '';
  const scp = /^[\w.-]+@([a-z0-9.-]+):(?!\/\/)(.+)$/i.exec(raw);
  const url = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)\/(.+)$/i.exec(raw);
  if (scp) {
    [, host, path] = scp;
  } else if (url) {
    [, host, path] = url;
    // An SSH port is meaningless on the web UI; an HTTPS one (a self-hosted
    // server on :8443) is kept.
    if (/^ssh:/i.test(raw) || /^git:/i.test(raw)) host = host.replace(/:\d+$/, '');
  } else if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\/.+/i.test(raw)) {
    [host, path] = [raw.slice(0, raw.indexOf('/')), raw.slice(raw.indexOf('/') + 1)];
  } else if (/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    [host, path] = ['github.com', raw];
  } else {
    return null;
  }

  path = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!HOST.test(host) || !path) return null;
  return { host: host.toLowerCase(), path };
};

// The repository's web page, for an `href`. Always `https://` + a validated host,
// so the stored string never supplies the scheme — the same rule as the Link and
// Domain columns (docs/security.md § Stored HTML and XSS).
export const repoWebUrl = (value: string): string | null => {
  const parts = repoParts(value);
  return parts ? `https://${parts.host}/${parts.path}` : null;
};

// What to print: `org/repo` for a recognisable repository, else the text as
// entered (minus any credentials).
export const repoLabel = (value: string): string =>
  repoParts(value)?.path ?? stripRepoCredentials(value);

// `owner/name` when the repository is on GitHub, else null — the key the branch
// picker lists branches for. Only github.com: that's the one server the app has a
// token for.
export const githubFullName = (value: string): string | null => {
  const parts = repoParts(value);
  if (!parts || parts.host !== 'github.com') return null;
  const segments = parts.path.split('/');
  return segments.length === 2 && segments.every(Boolean) ? parts.path : null;
};
