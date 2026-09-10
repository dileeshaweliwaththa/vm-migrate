import {
  findAllVmJenkins,
  findVmJenkins,
  upsertVmJenkins,
} from '@/repositories/vmJenkins/vmJenkinsRepository';
import {
  findVmIdsWithJenkinsToken,
  getVmJenkinsToken,
  setVmJenkinsToken,
} from '@/repositories/vmJenkins/vmJenkinsSecretRepository';
import { getCurrentRole } from '@/services/auth/authService';
import { canEdit } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import { pingJenkins } from '@/repositories/jenkins/jenkinsRepository';
import { isDeniedJenkinsTarget, normalizeJenkinsServerUrl } from '@/lib/jenkins-url';
import type { VmJenkinsConfig, VmJenkinsInput } from '@/types/common/jenkins';

// Service layer: a VM's Jenkins server.
//
// A VM runs **one** Jenkins, so the server, its Basic-auth user and its API
// token are the machine's, and an environment only names the *job* it runs
// there. This is the one place those three are written; `jenkinsService` reads
// them when it talks to the server.
//
// It deliberately does not import `jenkinsService` (which imports
// `projectService`, which would close a cycle) and depends only on repositories
// and `lib/jenkins-url`.

const requireEditor = async (action: string): Promise<void> => {
  if (!canEdit(await getCurrentRole())) {
    throw new ForbiddenError(`Editor access required to ${action}.`);
  }
};

// Public, secret-free view: the URL and the username, plus whether a token is
// stored. Open to every signed-in role, matching the RLS on `vm_jenkins` — the
// tracker marks which machines have Jenkins set up, and that is not a secret.
export const getVmJenkinsConfig = async (vmId: string): Promise<VmJenkinsConfig | null> => {
  const row = await findVmJenkins(vmId);
  if (!row) return null;
  return {
    vmId: row.vm_id,
    baseUrl: row.base_url,
    username: row.username,
    hasToken: (await findVmIdsWithJenkinsToken([vmId])).length > 0,
  };
};

// Every configured VM in one pass, for the tracker grid. Two queries for the
// whole page rather than two per VM.
export const listVmJenkinsConfigs = async (): Promise<VmJenkinsConfig[]> => {
  const rows = await findAllVmJenkins();
  if (rows.length === 0) return [];

  const withToken = new Set(await findVmIdsWithJenkinsToken(rows.map((r) => r.vm_id)));
  return rows.map((row) => ({
    vmId: row.vm_id,
    baseUrl: row.base_url,
    username: row.username,
    hasToken: withToken.has(row.vm_id),
  }));
};

// Server-internal: the credentials themselves. Never routed to a client — the
// only caller is `jenkinsService`, resolving what to authenticate an outbound
// request with.
export const getVmJenkinsCredentials = async (
  vmId: string
): Promise<{ base: string; username: string; apiToken: string }> => {
  const row = await findVmJenkins(vmId);
  if (!row) return { base: '', username: '', apiToken: '' };
  return {
    base: row.base_url.trim(),
    username: row.username.trim(),
    apiToken: (await getVmJenkinsToken(vmId)).trim(),
  };
};

export const saveVmJenkinsConfig = async (
  vmId: string,
  input: VmJenkinsInput
): Promise<VmJenkinsConfig> => {
  await requireEditor("set a VM's Jenkins server");

  // `20.197.41.68` in, `http://20.197.41.68:8080` out — the port is the Jenkins
  // default and typing it every time is noise. See `normalizeJenkinsServerUrl`.
  const baseUrl = normalizeJenkinsServerUrl(input.baseUrl);

  // The SSRF guard runs on the way in, so a denied address never reaches the
  // table — and every read path re-checks whatever it is about to fetch. See
  // docs/security.md.
  if (baseUrl && isDeniedJenkinsTarget(baseUrl)) {
    throw new Error('That Jenkins address is not allowed.');
  }

  const username = input.username.trim();
  const token = input.apiToken?.trim() ?? '';

  // A token is useless without the user it belongs to: Jenkins Basic auth is the
  // pair. Caught here rather than at the first failed request, which would
  // report a 401 from Jenkins instead of the actual mistake.
  if (token && !username) {
    throw new Error('A Jenkins username is required alongside the API token.');
  }

  const row = await upsertVmJenkins(vmId, { base_url: baseUrl, username });
  // An empty field means "leave the stored token alone" — the dialog is never
  // sent the token, so it has nothing to send back and a blank must not wipe it.
  if (token) await setVmJenkinsToken(vmId, token);

  return {
    vmId: row.vm_id,
    baseUrl: row.base_url,
    username: row.username,
    hasToken: token ? true : (await findVmIdsWithJenkinsToken([vmId])).length > 0,
  };
};

// Does this VM's Jenkins actually answer, with these credentials?
//
// Configuring a server and finding out whether it works are the same moment —
// otherwise the first sign of a wrong token is a failed sync on some
// environment, hours later and three pages away. So the dialog tests, and this
// is what it calls: the smallest authenticated request Jenkins answers, with
// each failure reported as the thing that is actually wrong.
//
// `override` lets the form test what is typed **before** it is saved. Falling
// back to the stored values means an already-configured VM can be re-tested
// without retyping the token, which the browser never receives.
export const testVmJenkinsConnection = async (
  vmId: string,
  override?: Partial<VmJenkinsInput>
): Promise<{ ok: boolean; message: string }> => {
  await requireEditor("test a VM's Jenkins server");

  const stored = await getVmJenkinsCredentials(vmId);
  const base = override?.baseUrl?.trim()
    ? normalizeJenkinsServerUrl(override.baseUrl)
    : stored.base;
  const username = override?.username?.trim() || stored.username;
  const apiToken = override?.apiToken?.trim() || stored.apiToken;

  if (!base) return { ok: false, message: 'Set the server address first.' };
  // Re-checked on the way out, not just on save: this is an outbound request to
  // whatever address is in hand, including one typed into the form. See
  // docs/security.md.
  if (isDeniedJenkinsTarget(base)) {
    return { ok: false, message: 'That Jenkins address is not allowed.' };
  }
  if (!username || !apiToken) {
    return {
      ok: false,
      message: 'Add the username and API token — Jenkins needs both to authenticate.',
    };
  }

  const result = await pingJenkins({ username, apiToken }, base);

  if (result.ok) {
    return {
      ok: true,
      message: result.version
        ? `Connected to Jenkins ${result.version} at ${base} as ${username}.`
        : `Connected to ${base} as ${username}.`,
    };
  }

  // Each status says something different about what to fix, and a bare
  // "connection failed" would send the reader looking in the wrong place.
  if (result.status === 401 || result.status === 403) {
    return {
      ok: false,
      message: `Reached ${base}, but it rejected the credentials — check the username and API token.`,
    };
  }
  if (result.status === 404) {
    return {
      ok: false,
      message: `Reached ${base}, but no Jenkins API answered there — is that the server root?`,
    };
  }
  if (result.status > 0) {
    return { ok: false, message: `${base} answered HTTP ${result.status}.` };
  }
  return {
    ok: false,
    message: `Couldn't reach ${base}${result.error ? ` — ${result.error}` : ''}.`,
  };
};
