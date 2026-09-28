import { connect } from 'node:net';

// Repository layer — outbound liveness probes for the VM page's health check
// (docs/vms.md). One of the documented exceptions to "repositories only touch
// Supabase" (AGENTS.md): it opens HTTP requests and TCP connections to addresses
// the service hands it. No business rules — which targets, the denylist and the
// limits are all `vmHealthService`'s — just the probe and a raw result.
//
// What a probe deliberately does **not** do (docs/security.md § SSRF):
//
// - send credentials: no Authorization header, no cookies — a fixed User-Agent
//   and nothing else;
// - follow redirects: `redirect: 'manual'`, so a 3xx is reported as the answer
//   rather than a hop to somewhere the service never checked;
// - read the body: the response is cancelled unread, so nothing the target
//   returns can be reflected back to the caller beyond its status code.

export interface ProbeResult {
  // True when the target answered at all — an HTTP response of any status, or a
  // completed TCP handshake. Whether that counts as "up" is the service's call.
  answered: boolean;
  status: number | null;
  // Wall-clock time until the answer (or the failure).
  ms: number;
  // A short machine-ish reason when it didn't answer: an errno code
  // (`ECONNREFUSED`), `TIMEOUT`, or a TLS error code.
  error?: string;
}

const USER_AGENT = 'devops-portal-health/1';

// Node's fetch wraps the real reason in `cause` (`TypeError: fetch failed`).
const reasonOf = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'TIMEOUT';
    const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
    return cause?.code || cause?.message || error.message;
  }
  return String(error);
};

export const probeHttp = async (url: string, timeoutMs: number): Promise<ProbeResult> => {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - started;
    // Unread on purpose — see the header comment.
    await res.body?.cancel().catch(() => undefined);
    return { answered: true, status: res.status, ms };
  } catch (error) {
    return { answered: false, status: null, ms: Date.now() - started, error: reasonOf(error) };
  }
};

export const probeTcp = (host: string, port: number, timeoutMs: number): Promise<ProbeResult> =>
  new Promise((resolve) => {
    const started = Date.now();
    const socket = connect({ host, port });
    const finish = (result: Omit<ProbeResult, 'ms'>) => {
      socket.destroy();
      resolve({ ...result, ms: Date.now() - started });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ answered: true, status: null }));
    socket.once('timeout', () => finish({ answered: false, status: null, error: 'TIMEOUT' }));
    socket.once('error', (error: NodeJS.ErrnoException) =>
      finish({ answered: false, status: null, error: error.code || error.message })
    );
  });
