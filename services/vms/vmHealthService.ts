import { getCurrentRole } from '@/services/auth/authService';
import { getVmDetail } from '@/services/vms/vmService';
import { probeHttp, probeTcp, type ProbeResult } from '@/repositories/health/endpointProbeRepository';
import { domainUrl, recordLiveUrl, vmLiveIp } from '@/lib/endpoints';
import { isDeniedOutboundTarget } from '@/lib/outbound-url';
import { canCheckHealth } from '@/lib/rbac';
import { ForbiddenError } from '@/lib/errors';
import type {
  EndpointHealth,
  HealthTargetKind,
  Protocol,
  Vm,
  VmHealthReport,
  VmUrl,
} from '@/types/common/vm';

// Service layer: the VM page's live health check (docs/vms.md). Decides *what*
// to probe for each of a machine's endpoints, refuses what must not be probed,
// bounds how much one check does, and turns raw probe results into up / down /
// skipped. The probing itself is `endpointProbeRepository`.
//
// Nothing is stored: a check is a snapshot, run when the page opens and on
// "Check now". See docs/security.md (A9) for why every signed-in role may run it.

// One check is bounded in both directions — no single target can hang it, and a
// machine with hundreds of endpoints can't turn a page view into hundreds of
// outbound requests. Worst case ≈ ceil(40 / 6) × 4s ≈ 28s.
const PROBE_TIMEOUT_MS = 4_000;
const PROBE_CONCURRENCY = 6;
const MAX_TARGETS = 40;

// What is probed over HTTP. WS/WSS are too: a WebSocket endpoint answers a plain
// GET (usually 400/426), which is exactly the "is anything listening" signal.
const HTTP_PROTOCOLS: readonly Protocol[] = ['HTTP', 'HTTPS', 'WS', 'WSS'];

type Target =
  | { urlId: string; kind: HealthTargetKind; target: string; probe: 'http'; url: string }
  | { urlId: string; kind: HealthTargetKind; target: string; probe: 'tcp'; host: string; port: number }
  | { urlId: string; kind: HealthTargetKind; target: string; probe: 'skip'; message: string };

// The address an endpoint answers on: the adopted one it names, else the
// machine's live address — the same rule as the Link column (`recordAddress`).
const addressFor = (vm: Vm, url: VmUrl): string =>
  (url.ipId && vm.ips.find((ip) => ip.id === url.ipId)?.address) || vmLiveIp(vm);

const targetsFor = (vm: Vm, url: VmUrl): Target[] => {
  const base = { urlId: url.id };
  const address = addressFor(vm, url);
  const port = url.port.trim();

  if (url.proto === 'UDP') {
    return [{ ...base, kind: 'direct', target: `udp://${address}:${port}`, probe: 'skip', message: 'UDP has no reliable liveness check' }];
  }

  if (url.proto === 'TCP') {
    const portNumber = Number(port);
    if (!address || !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      return [{ ...base, kind: 'direct', target: `tcp://${address || '?'}:${port || '?'}`, probe: 'skip', message: 'Needs an address and a port' }];
    }
    return [{ ...base, kind: 'direct', target: `tcp://${address}:${portNumber}`, probe: 'tcp', host: address, port: portNumber }];
  }

  if (!HTTP_PROTOCOLS.includes(url.proto)) return [];

  const out: Target[] = [];
  // Built by the same helper as the Link column, so the check probes exactly the
  // address the page links to — and a stored value never supplies the scheme.
  const direct = recordLiveUrl({ port, protocol: url.proto }, address || null);
  out.push(
    direct
      ? { ...base, kind: 'direct', target: direct, probe: 'http', url: direct }
      : { ...base, kind: 'direct', target: `${address || '?'}:${port || '?'}`, probe: 'skip', message: port ? 'The VM has no address' : 'No port recorded' }
  );
  const domain = domainUrl(url.url);
  if (domain) out.push({ ...base, kind: 'domain', target: domain, probe: 'http', url: domain });
  return out;
};

// The denylist applies to whatever is about to be fetched — link-local and
// metadata addresses are never probed, whoever stored them.
const deny = (t: Target): Target => {
  if (t.probe === 'skip') return t;
  const url = t.probe === 'http' ? t.url : `http://${t.host}`;
  return isDeniedOutboundTarget(url)
    ? { urlId: t.urlId, kind: t.kind, target: t.target, probe: 'skip', message: 'Link-local / metadata address — never probed' }
    : t;
};

const REASONS: Record<string, string> = {
  TIMEOUT: `No answer within ${PROBE_TIMEOUT_MS / 1000}s`,
  ECONNREFUSED: 'Connection refused — nothing listening on that port',
  ENOTFOUND: 'The domain doesn’t resolve',
  EAI_AGAIN: 'DNS lookup failed',
  EHOSTUNREACH: 'Host unreachable',
  ENETUNREACH: 'Network unreachable',
  ECONNRESET: 'Connection reset',
};

const describe = (error: string | undefined): string => {
  if (!error) return 'No answer';
  if (REASONS[error]) return REASONS[error];
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(error)) return `TLS certificate problem (${error})`;
  return error;
};

const toHealth = (t: Target, result: ProbeResult | null): EndpointHealth => {
  const base = { urlId: t.urlId, kind: t.kind, target: t.target };
  if (t.probe === 'skip' || !result) {
    return { ...base, state: 'skipped', status: null, ms: null, message: t.probe === 'skip' ? t.message : '' };
  }
  if (!result.answered) {
    return { ...base, state: 'down', status: null, ms: result.ms, message: describe(result.error) };
  }
  // Any response below 500 proves the server is there — a 404 on `/` is an API
  // with no root route, not an outage. The code is shown so it can be read.
  const serverError = result.status !== null && result.status >= 500;
  return {
    ...base,
    state: serverError ? 'down' : 'up',
    status: result.status,
    ms: result.ms,
    message: serverError ? `Server error (HTTP ${result.status})` : '',
  };
};

// A small worker pool: at most PROBE_CONCURRENCY probes in flight.
const runPool = async <T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(PROBE_CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(lanes);
  return results;
};

// Null for an unknown or trashed VM (the route answers 404).
export const checkVmHealth = async (vmId: string): Promise<VmHealthReport | null> => {
  if (!canCheckHealth(await getCurrentRole())) {
    throw new ForbiddenError('Authenticated access required to check health.');
  }

  const detail = await getVmDetail(vmId);
  if (!detail) return null;

  const all = detail.vm.urls.flatMap((url) => targetsFor(detail.vm, url)).map(deny);
  const targets = all.slice(0, MAX_TARGETS);

  const results = await runPool(targets, async (t) => {
    if (t.probe === 'http') return toHealth(t, await probeHttp(t.url, PROBE_TIMEOUT_MS));
    if (t.probe === 'tcp') return toHealth(t, await probeTcp(t.host, t.port, PROBE_TIMEOUT_MS));
    return toHealth(t, null);
  });

  return {
    vmId,
    checkedAt: new Date().toISOString(),
    results,
    truncated: all.length - targets.length,
  };
};
