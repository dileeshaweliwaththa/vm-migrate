import type { EnvironmentPort, PortSource } from '@/types/common/project';
import type { ExtractedPort, PortSyncPlan } from '@/types/common/jenkins';

// What a Jenkins port sync would change, worked out with no I/O (#33). The
// preview shows it, and apply recomputes it and writes exactly its `added` and
// `removed`. Because unchanged records are left alone rather than deleted and
// re-inserted, applying twice against the same job config is a true no-op.

// The one source a sync owns. Everything else is someone's hand-entered or
// imported record and is never touched.
const SYNC_SOURCE: PortSource = 'jenkins';

// A record and an extracted port are "the same" when port and protocol agree.
// `Number()` so `0080` and `80` match; a protocol change is a removal plus an
// addition, which is what it is.
const keyOf = (port: string, protocol: string): string => `${Number(port)}/${protocol}`;

export const planPortSync = (
  existing: EnvironmentPort[],
  extracted: ExtractedPort[]
): PortSyncPlan => {
  const synced = existing.filter((record) => record.source === SYNC_SOURCE);
  const kept = existing.filter((record) => record.source !== SYNC_SOURCE);
  const wanted = new Set(extracted.map((port) => keyOf(port.port, port.protocol)));

  // The first synced record per key stays. A duplicate of it (left by an older
  // sync, say) is removed, so a sync converges on one record per port.
  const claimed = new Set<string>();
  const unchanged: EnvironmentPort[] = [];
  const removed: EnvironmentPort[] = [];
  for (const record of synced) {
    const key = keyOf(record.port, record.protocol);
    if (wanted.has(key) && !claimed.has(key)) {
      claimed.add(key);
      unchanged.push(record);
    } else {
      removed.push(record);
    }
  }

  const added = extracted.filter((port) => !claimed.has(keyOf(port.port, port.protocol)));

  // Order-independent, so the same change always has the same fingerprint.
  const fingerprint = [
    ...added.map((port) => `+${keyOf(port.port, port.protocol)}`),
    ...removed.map((record) => `-${record.id}`),
  ]
    .sort()
    .join(',');

  return { added, unchanged, removed, kept, fingerprint };
};
