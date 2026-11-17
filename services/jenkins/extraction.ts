import type { Protocol } from '@/types/common/vm';
import type {
  ExtractedPort,
  JenkinsRecordSource,
  PortExtraction,
  SkippedPortCandidate,
} from '@/types/common/jenkins';

// Best-effort extraction from Jenkins job config (D3). Jenkins jobs don't expose
// "deployed ports" natively — they live in Dockerfiles / deploy scripts / build
// commands embedded in the job config. This scans the config text for common
// patterns and returns what it maps, **and what it saw and couldn't**, so a sync
// never reads as "covered everything" when it didn't (phase-2-plan.md §10, #28).

interface PortPattern {
  label: string;
  regex: RegExp;
  // Which capture group holds the container/app port.
  group: number;
}

// Ordered, most-specific first. All run against the raw config text.
//
// The capture is `\d+`, not `\d{2,5}`: a bounded count silently skipped
// `-p 8080:123456` (no 2-5 digit run ends on a word boundary there), so the one
// mistake worth reporting never reached the validity check below.
const PORT_PATTERNS: PortPattern[] = [
  { label: 'docker -p mapping', regex: /-p\s+\d+:(\d+)\b/gi, group: 1 },
  // `(?!:)`: not the host half of a mapping. Without it `-p 8080:3000` also
  // yielded 8080, the *host* port, as if the container listened on it.
  { label: 'docker -p single', regex: /-p\s+(\d+)\b(?!:)/gi, group: 1 },
  { label: 'Dockerfile EXPOSE', regex: /EXPOSE\s+(\d+)\b/gi, group: 1 },
  { label: 'k8s containerPort', regex: /containerPort:\s*(\d+)\b/gi, group: 1 },
  { label: 'server.port', regex: /server\.port\s*[=:]\s*(\d+)\b/gi, group: 1 },
  { label: '--port flag', regex: /--port[=\s]+(\d+)\b/gi, group: 1 },
  { label: 'PORT env', regex: /\bPORT\s*[=:]\s*(\d+)\b/g, group: 1 },
];

// Places a port shows up that no pattern above turns into a record. Only used to
// *report* what was left behind: a hint whose number a pattern already mapped is
// claimed and not reported.
const PORT_HINTS: PortPattern[] = [
  { label: 'URL with a port', regex: /\b[a-z][\w+.-]*:\/\/[^\s/:'"<>]+:(\d+)/gi, group: 1 },
  { label: 'host:port', regex: /\b(?:localhost|\d{1,3}(?:\.\d{1,3}){3}):(\d+)\b/gi, group: 1 },
  { label: 'quoted port mapping', regex: /["']\d+:(\d+)["']/g, group: 1 },
  { label: '--publish flag', regex: /--publish[=\s]+(?:\d+:)?(\d+)\b/gi, group: 1 },
  { label: 'nginx listen', regex: /\blisten\s+(\d+)\b/gi, group: 1 },
];

const isPlausiblePort = (n: number): boolean => n >= 1 && n <= 65535;

// About a line of text around a match, decoded, so a skipped item can be found in
// the job config by eye.
const CONTEXT_CHARS = 40;
const contextAround = (xml: string, index: number, length: number): string => {
  const start = Math.max(0, index - CONTEXT_CHARS);
  const end = Math.min(xml.length, index + length + CONTEXT_CHARS);
  const text = decodeXml(xml.slice(start, end)).replace(/\s+/g, ' ');
  return `${start > 0 ? '…' : ''}${text}${end < xml.length ? '…' : ''}`;
};

// HTTPS is the tracker default; downgrade to HTTP only if the config clearly
// mentions plain http near no TLS markers.
const inferProtocol = (xml: string): Protocol => {
  const hasHttps = /https:\/\/|:443\b|tls|ssl/i.test(xml);
  const hasHttp = /http:\/\//i.test(xml);
  if (hasHttp && !hasHttps) return 'HTTP';
  return 'HTTPS';
};

export const extractPorts = (xml: string): PortExtraction => {
  if (!xml) return { ports: [], skipped: [] };
  const protocol = inferProtocol(xml);
  const seen = new Map<string, ExtractedPort>();
  // Keyed by reason + number, so a port that's out of range in five places is
  // reported once, with the first place it appeared.
  const skipped = new Map<string, SkippedPortCandidate>();
  const skip = (candidate: SkippedPortCandidate) => {
    const key = `${candidate.reason}:${candidate.token}`;
    if (!skipped.has(key)) skipped.set(key, candidate);
  };

  for (const { label, regex, group } of PORT_PATTERNS) {
    for (const match of xml.matchAll(regex)) {
      const raw = match[group];
      if (!raw) continue;
      if (!isPlausiblePort(Number(raw))) {
        skip({
          token: raw,
          reason: 'out_of_range',
          foundIn: label,
          context: contextAround(xml, match.index, match[0].length),
        });
        continue;
      }
      if (!seen.has(raw)) {
        seen.set(raw, { port: raw, protocol, description: `Detected (${label})`, foundIn: label });
      }
    }
  }

  // Normalised the way the patterns' results are keyed (`0080` is port 80).
  const mapped = new Set(Array.from(seen.keys(), (port) => String(Number(port))));
  for (const { label, regex, group } of PORT_HINTS) {
    for (const match of xml.matchAll(regex)) {
      const raw = match[group];
      if (!raw || mapped.has(String(Number(raw)))) continue;
      skip({
        token: raw,
        reason: isPlausiblePort(Number(raw)) ? 'no_pattern' : 'out_of_range',
        foundIn: label,
        context: contextAround(xml, match.index, match[0].length),
      });
    }
  }

  return { ports: Array.from(seen.values()), skipped: Array.from(skipped.values()) };
};

// ── Repository and branch ────────────────────────────────────────────────────
//
// Where a job builds from, read out of its config.xml. Unlike ports this *is*
// structured data in most jobs, just in one of several shapes depending on the
// job type. Tried in order, first hit wins per field:
//
//   1. Git SCM block — freestyle jobs, "Pipeline script from SCM", and the
//      per-branch jobs inside a multibranch project all carry
//      `<userRemoteConfigs>…<url>` and `<hudson.plugins.git.BranchSpec><name>`.
//   2. Multibranch branch property — the branch a multibranch child job is for.
//   3. Branch sources — `<remote>` (plain Git source) or GitHub's
//      `<repoOwner>` + `<repository>`.
//   4. An inline pipeline script — `git url: '…', branch: '…'` or a
//      `checkout([$class: 'GitSCM', branches: [[name: '…']], …])` step.
//
// A branch given as a job parameter (`${BRANCH}`) resolves to that parameter's
// default value, which is what a plain "Build" runs.

// config.xml is XML, so values arrive entity-encoded (`&amp;` in a URL query).
const decodeXml = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();

const firstGroup = (text: string, ...patterns: RegExp[]): string => {
  for (const pattern of patterns) {
    const value = pattern.exec(text)?.[1];
    if (value && decodeXml(value)) return decodeXml(value);
  }
  return '';
};

// `*/main`, `origin/main`, `refs/heads/main` all mean `main`.
const normaliseBranch = (spec: string): string =>
  spec
    .trim()
    .replace(/^\*\//, '')
    .replace(/^refs\/heads\//, '')
    .replace(/^origin\//, '');

export const extractScm = (xml: string): JenkinsRecordSource => {
  const empty: JenkinsRecordSource = { repoUrl: '', branch: '', branchParameter: '', scriptPath: '' };
  if (!xml) return empty;

  // The inline pipeline, decoded once — its quotes are entity-encoded in the XML.
  const script = decodeXml(/<script>([\s\S]*?)<\/script>/.exec(xml)?.[1] ?? '');

  const githubOwner = firstGroup(xml, /<repoOwner>([^<]+)<\/repoOwner>/);
  const githubRepo = firstGroup(xml, /<repository>([^<]+)<\/repository>/);

  const repoUrl =
    firstGroup(
      xml,
      /<userRemoteConfigs>[\s\S]*?<url>([^<]+)<\/url>/,
      /<remote>([^<]+)<\/remote>/
    ) ||
    (githubOwner && githubRepo ? `https://github.com/${githubOwner}/${githubRepo}` : '') ||
    firstGroup(script, /\burl\s*:\s*['"]([^'"]+)['"]/, /\bgit\s+['"]([^'"]+)['"]/);

  let branch = normaliseBranch(
    firstGroup(
      xml,
      /<hudson\.plugins\.git\.BranchSpec>\s*<name>([^<]+)<\/name>/,
      /<org\.jenkinsci\.plugins\.workflow\.multibranch\.BranchJobProperty>[\s\S]*?<name>([^<]+)<\/name>/
    ) ||
      firstGroup(
        script,
        /\bbranch\s*:\s*['"]([^'"]+)['"]/,
        /branches\s*:\s*\[\s*\[\s*name\s*:\s*['"]([^'"]+)['"]/
      )
  );

  // `${BRANCH}` / `$BRANCH` / `${params.BRANCH}` → the parameter's default.
  let branchParameter = '';
  const param = /^\$\{?(?:params\.)?(\w+)\}?$/.exec(branch)?.[1];
  if (param) {
    branchParameter = param;
    const definition = new RegExp(
      `<name>${param}</name>[\s\S]*?<defaultValue>([^<]*)</defaultValue>`
    );
    branch = normaliseBranch(firstGroup(xml, definition));
  }

  // A wildcard spec (`**`, `*/release-*`) builds whatever matches — a pattern,
  // not a branch. Shown as written rather than guessed at.
  return {
    repoUrl,
    branch,
    branchParameter,
    scriptPath: firstGroup(xml, /<scriptPath>([^<]+)<\/scriptPath>/),
  };
};
