import type { Protocol } from '@/types/common/vm';

// Domain types for importing environment records from pasted `docker ps` output
// (M4). See docs/docker-import.md.

// One published port of a container. `hostPort` is the reachable one — that's what
// becomes the record's port; `containerPort` is kept for context and to infer the
// protocol.
export interface DockerPortMapping {
  hostPort: string;
  containerPort: string;
  protocol: Protocol;
}

// A container as read off one line of `docker ps`.
export interface DockerContainer {
  containerId: string;
  image: string;
  name: string;
  status: string;
  ports: DockerPortMapping[];
}

// One importable record: a single (container, published port) pair, already
// checked against what the environment tracks.
export interface DockerCandidate {
  // Stable within a preview, so the UI can key rows and track selection.
  key: string;
  name: string;
  port: string;
  containerPort: string;
  protocol: Protocol;
  image: string;
  status: string;
  // True when the environment already has a record on this host port. Those are
  // shown but not imported, so re-pasting the same output is a no-op and nothing
  // hand-edited gets overwritten.
  tracked: boolean;
}

// Result of parsing a paste. `skipped` and `unparsed` exist so nothing disappears
// quietly: `skipped` are containers understood but publishing no ports, `unparsed`
// are lines that looked like data and yielded nothing.
export interface DockerParseResult {
  candidates: DockerCandidate[];
  skipped: DockerContainer[];
  unparsed: string[];
}
