import type { Protocol } from '@/types/common/vm';
import type { ExtractedPort } from '@/types/common/jenkins';

// Best-effort extraction from Jenkins job config (D3). Jenkins jobs don't expose
// "deployed ports" natively — they live in Dockerfiles / deploy scripts / build
// commands embedded in the job config. This scans the config text for common
// patterns and returns what it finds; callers log whatever couldn't be mapped
// (no silent truncation — see phase-2-plan.md §10).

interface PortPattern {
  label: string;
  regex: RegExp;
  // Which capture group holds the container/app port.
  group: number;
}

// Ordered, most-specific first. All run against the raw config text.
const PORT_PATTERNS: PortPattern[] = [
  { label: 'docker -p mapping', regex: /-p\s+\d+:(\d{2,5})\b/gi, group: 1 },
  { label: 'docker -p single', regex: /-p\s+(\d{2,5})\b/gi, group: 1 },
  { label: 'Dockerfile EXPOSE', regex: /EXPOSE\s+(\d{2,5})\b/gi, group: 1 },
  { label: 'k8s containerPort', regex: /containerPort:\s*(\d{2,5})\b/gi, group: 1 },
  { label: 'server.port', regex: /server\.port\s*[=:]\s*(\d{2,5})\b/gi, group: 1 },
  { label: '--port flag', regex: /--port[=\s]+(\d{2,5})\b/gi, group: 1 },
  { label: 'PORT env', regex: /\bPORT\s*[=:]\s*(\d{2,5})\b/g, group: 1 },
];

const isPlausiblePort = (n: number): boolean => n >= 1 && n <= 65535;

// HTTPS is the tracker default; downgrade to HTTP only if the config clearly
// mentions plain http near no TLS markers.
const inferProtocol = (xml: string): Protocol => {
  const hasHttps = /https:\/\/|:443\b|tls|ssl/i.test(xml);
  const hasHttp = /http:\/\//i.test(xml);
  if (hasHttp && !hasHttps) return 'HTTP';
  return 'HTTPS';
};

export const extractPorts = (xml: string): ExtractedPort[] => {
  if (!xml) return [];
  const protocol = inferProtocol(xml);
  const seen = new Map<string, ExtractedPort>();

  for (const { label, regex, group } of PORT_PATTERNS) {
    for (const match of xml.matchAll(regex)) {
      const raw = match[group];
      const num = Number(raw);
      if (!raw || !isPlausiblePort(num)) continue;
      if (!seen.has(raw)) {
        seen.set(raw, { port: raw, protocol, description: `Detected (${label})`, foundIn: label });
      }
    }
  }

  return Array.from(seen.values());
};
