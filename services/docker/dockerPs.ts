import type { Protocol } from '@/types/common/vm';
import type { DockerContainer, DockerPortMapping } from '@/types/common/docker';

// Parses pasted `docker ps` output into containers and their published ports.
// Pure text work, no I/O — mirrors services/jenkins/extraction.ts.
//
// Deliberately pattern-based rather than column-based. Reading the header row's
// offsets and slicing looks tidier and is wrong: docker's PORTS cell routinely
// exceeds the header's PORTS column width (a single mapping pair is ~43 chars vs a
// ~24-char column), which pushes NAMES out of alignment on exactly the rows that
// matter. Terminal wrapping makes it worse. Patterns don't care about alignment.

// `[host:]hostPort->containerPort/proto`, where host may be an IPv4 address, a
// bracketed IPv6 address, or a hostname — all optional.
const PORT_MAPPING =
  /(?:(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]*\]|[A-Za-z0-9._-]+):)?(\d{1,5})->(\d{1,5})\/(tcp|udp|sctp)/gi;

const CONTAINER_ID = /^([0-9a-f]{12,64})\s+(\S+)/i;

// A shell prompt, the command echo, or the column header — none are data.
const NOISE = [
  /^\s*$/,
  /^\s*\S*[@:].*[#$]\s*$/, // bare prompt line, e.g. "[root@IMA ~]#"
  /[#$]\s*(sudo\s+)?docker\s+(ps|container\s+ls)\b/i, // prompt + the command
  /^\s*CONTAINER\s+ID\b/i,
];

const isNoise = (line: string): boolean => NOISE.some((re) => re.test(line));

const isPlausiblePort = (value: string): boolean => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
};

// docker only reports the transport. The app's Protocol set is about how an
// endpoint is spoken to, so infer from the container port where it's well known
// and otherwise fall back to HTTPS — the same default extraction.ts uses.
const inferProtocol = (containerPort: string, transport: string): Protocol => {
  if (transport.toLowerCase() === 'udp') return 'UDP';
  if (containerPort === '80') return 'HTTP';
  if (containerPort === '443') return 'HTTPS';
  return 'HTTPS';
};

// Published ports for one line, deduped by host port: docker lists IPv4 and IPv6
// separately ("0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp") for what is one
// published port.
const parsePorts = (line: string): DockerPortMapping[] => {
  const byHostPort = new Map<string, DockerPortMapping>();
  for (const match of line.matchAll(PORT_MAPPING)) {
    const [, hostPort, containerPort, transport] = match;
    if (!isPlausiblePort(hostPort) || !isPlausiblePort(containerPort)) continue;
    if (byHostPort.has(hostPort)) continue;
    byHostPort.set(hostPort, {
      hostPort,
      containerPort,
      protocol: inferProtocol(containerPort, transport),
    });
  }
  return Array.from(byHostPort.values());
};

const STATUS = /\b((?:Up|Exited|Created|Restarting|Paused|Dead|Removal)\b[^,]*?)(?:\s{2,}|$)/;

// The container name is the last whitespace-delimited token on the line.
const parseName = (line: string): string => line.trim().split(/\s+/).pop() ?? '';

export interface DockerPsParse {
  containers: DockerContainer[];
  // Lines that survived the noise filter but yielded no container — surfaced to
  // the user rather than dropped (no silent truncation).
  unparsed: string[];
}

export const parseDockerPs = (output: string): DockerPsParse => {
  const containers: DockerContainer[] = [];
  const unparsed: string[] = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (isNoise(line)) continue;

    const idMatch = CONTAINER_ID.exec(line.trim());
    const ports = parsePorts(line);

    // No container id and no port mapping means we didn't understand the line at
    // all. With one or the other, there's something worth showing.
    if (!idMatch && ports.length === 0) {
      unparsed.push(line.trim());
      continue;
    }

    const name = parseName(line);
    // A name identical to the id (a one-token line) tells us nothing.
    if (!name || (idMatch && name === idMatch[1])) {
      unparsed.push(line.trim());
      continue;
    }

    containers.push({
      containerId: idMatch?.[1] ?? '',
      image: idMatch?.[2] ?? '',
      name,
      status: STATUS.exec(line)?.[1]?.trim() ?? '',
      ports,
    });
  }

  return { containers, unparsed };
};
