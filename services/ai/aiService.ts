import { GoogleGenAI } from '@google/genai';
import { generateJSON } from '@tiptap/html';
import type { JSONContent } from '@tiptap/core';
import { getCurrentRole } from '@/services/auth/authService';
import { getGeminiConfig } from '@/services/settings/settingsService';
import { getProject } from '@/services/projects/projectService';
import { canEdit } from '@/lib/rbac';
import { tiptapExtensions } from '@/lib/tiptap/extensions';
import { interpretGeminiError } from '@/services/ai/errors';
import type { ApiSingleResponse } from '@/types/common';
import { recordUrl } from '@/lib/endpoints';
import type {
  CicdProvider,
  EnvironmentPort,
  PortSource,
  ProjectDetail,
} from '@/types/common/project';
import { providerHasBranch } from '@/types/common/project';
import type { GeminiStatus } from '@/types/common/ai';

// Service layer: AI documentation generation (Gemini). Reads the key server-side
// via getGeminiConfig (never exposed to the browser), builds a prompt from the
// project's structured data plus the admin's house-style prompt, calls Gemini,
// and converts the returned HTML into Tiptap JSON the editor can load. The
// result is editable before the user saves it. See phase-2-plan.md §7.

// A fixed section skeleton keeps every generated doc consistent in shape.
//
// The tag allowlist is not arbitrary: the HTML is parsed back into Tiptap JSON with
// `tiptapExtensions` (StarterKit only), which has no table support — a <table>
// would be silently dropped on the way in. Keep endpoint data in lists.
const SYSTEM_PROMPT = [
  'You are a senior platform engineer writing internal deployment documentation.',
  'Return a single self-contained HTML fragment — no <html>, <head>, <body>, no',
  'markdown code fences, no commentary before or after.',
  'Use ONLY these tags: h2, h3, p, ul, ol, li, strong, em, code, pre, blockquote, hr.',
  'Do NOT use <table> — it is not supported and will be discarded.',
  'Structure the document with these H2 sections in order: Overview, Architecture,',
  'Environments, Deployment, Ports, Runbook. Omit a section only if there is truly',
  'nothing to say.',
  // The records are the most useful thing in the whole document and the easiest
  // for a model to summarise away, so both requirements are stated explicitly.
  'The provided data lists each environment with its RECORDS — the deployed',
  'endpoints, each with a port, protocol, domain and name. These are the most',
  'important facts in the document. Two hard requirements:',
  '(1) In the Environments section, give each environment its own h3 and list ALL',
  'of its records underneath, showing the domain and port for each; if an',
  'environment has no records, say so plainly.',
  '(2) In the Ports section, account for EVERY record across all environments —',
  'state which environment it belongs to, its port, protocol, domain, and the URL',
  'it is reachable at when one is given. The count of records is stated in the',
  'data; do not return fewer than that.',
  'Wrap ports, domains, and URLs in <code>.',
  'Where a value is marked NOT RECORDED YET, say it is not recorded yet — never',
  'guess or fill it in.',
  'Be concise and factual; do not invent infrastructure, ports, domains, or hosts',
  'that are not in the provided data.',
].join(' ');

// How a record's provenance should be described in prose.
const SOURCE_LABEL: Record<PortSource, string> = {
  manual: 'entered manually',
  jenkins: 'from its Jenkins job',
  docker: 'imported from docker ps',
};

// One record (endpoint) as a labelled line. Every field the record carries is
// spelled out — the model can only write about what it's given, and the domain in
// particular is the answer to "where does this environment actually live".
const recordLine = (record: EnvironmentPort, provider: CicdProvider): string => {
  const parts: string[] = [];
  // On a managed platform a record is a *branch*, not a host port — demanding a
  // port there would report a missing value that by definition doesn't exist.
  if (providerHasBranch(provider)) {
    parts.push(record.branch ? `branch ${record.branch}` : 'branch NOT RECORDED YET');
  } else {
    // A record added from Jenkins or docker may not have its port filled in yet.
    // Say so explicitly rather than emitting an empty value the model will guess at.
    parts.push(record.port ? `port ${record.port}` : 'port NOT RECORDED YET');
  }
  parts.push(`protocol ${record.protocol}`);
  parts.push(record.domain ? `domain ${record.domain}` : 'domain NOT RECORDED YET');
  if (record.description) parts.push(`name "${record.description}"`);

  const url = recordUrl(record);
  if (url) parts.push(`reachable at ${url}`);

  parts.push(SOURCE_LABEL[record.source]);
  if (record.jenkinsJobUrl) parts.push(`Jenkins job ${record.jenkinsJobUrl}`);
  return `    - ${parts.join('; ')}`;
};

const buildProjectContext = (project: ProjectDetail): string => {
  const lines: string[] = [];
  lines.push(`Project name: ${project.name}`);
  if (project.tags.length) lines.push(`Tags: ${project.tags.join(', ')}`);
  if (project.description) lines.push(`Description: ${project.description}`);

  if (project.environments.length === 0) {
    lines.push('Environments: none defined yet.');
    return lines.join('\n');
  }

  // A stated total keeps the model honest about the Ports section: it can check
  // it has accounted for every record instead of summarising a few.
  const recordCount = project.environments.reduce((n, env) => n + env.ports.length, 0);
  lines.push(
    `Environments: ${project.environments.length}. Records (deployed endpoints) in total: ${recordCount}.`
  );

  for (const env of project.environments) {
    const parts = [`- ${env.name}`, `CI/CD: ${env.cicdProvider}`];
    if (env.deployUrl) parts.push(`deploy URL: ${env.deployUrl}`);
    if (env.jenkinsUrl) parts.push(`Jenkins: ${env.jenkinsUrl}`);
    if (env.vmName) parts.push(`VM: ${env.vmName}`);
    if (env.notes) parts.push(`notes: ${env.notes}`);
    lines.push(`  ${parts.join(', ')}`);

    if (env.ports.length === 0) {
      lines.push(`    - no records (ports/domains) recorded for ${env.name} yet`);
      continue;
    }
    lines.push(`    records for ${env.name} (${env.ports.length}):`);
    for (const record of env.ports) lines.push(recordLine(record, env.cicdProvider));
  }

  return lines.join('\n');
};

// Strips accidental markdown code fences the model sometimes wraps HTML in.
const stripCodeFences = (text: string): string =>
  text
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

// Lists the Gemini models the configured key can use for generateContent, so
// the settings UI can offer a dropdown instead of a free-text model name. Reads
// the key server-side (never exposed); editor+ only.
export const listGeminiModels = async (): Promise<ApiSingleResponse<string[]>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  const config = await getGeminiConfig();
  if (!config) {
    return { success: false, message: 'Save a Gemini API key first, then reload models.', data: null };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const pager = await ai.models.list();
    const ids = new Set<string>();
    for await (const model of pager) {
      const name = (model.name ?? '').replace(/^models\//, '');
      if (!name.startsWith('gemini-')) continue; // skip embeddings/aqa/etc.
      const actions = model.supportedActions ?? [];
      if (actions.length === 0 || actions.includes('generateContent')) ids.add(name);
    }
    const list = Array.from(ids).sort((a, b) => b.localeCompare(a)); // newest-ish first
    return { success: true, message: 'OK', data: list };
  } catch (error) {
    return { success: false, message: interpretGeminiError(error).message, data: null };
  }
};

// Live health check for the Settings page. Makes a tiny generate call and
// reports the outcome — including quota/rate-limit state and when to retry —
// as a graceful status rather than a raw error. Editor+.
export const checkGeminiStatus = async (): Promise<ApiSingleResponse<GeminiStatus>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  const config = await getGeminiConfig();
  if (!config) {
    return {
      success: true,
      message: 'No key configured.',
      data: { configured: false, ok: false, quotaExceeded: false, message: 'No Gemini API key is configured yet.' },
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    await ai.models.generateContent({
      model: config.model,
      contents: 'ping',
      config: { maxOutputTokens: 1 },
    });
    return {
      success: true,
      message: 'OK',
      data: { configured: true, ok: true, quotaExceeded: false, message: `Ready — model ${config.model}.` },
    };
  } catch (error) {
    const info = interpretGeminiError(error);
    const retryAt = info.retryAfterSeconds
      ? new Date(Date.now() + info.retryAfterSeconds * 1000).toISOString()
      : undefined;
    return {
      success: true,
      message: info.message,
      data: {
        configured: true,
        ok: false,
        quotaExceeded: info.quotaExceeded,
        message: info.message,
        retryAfterSeconds: info.retryAfterSeconds,
        retryAt,
      },
    };
  }
};

export const generateProjectDocs = async (
  projectId: string
): Promise<ApiSingleResponse<{ contentJson: JSONContent }>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) {
    return { success: false, message: 'Editor access required.', data: null };
  }

  const config = await getGeminiConfig();
  if (!config) {
    return {
      success: false,
      message: 'AI is not configured. An admin must add a Gemini API key in Settings.',
      data: null,
    };
  }

  const project = await getProject(projectId);
  if (!project) return { success: false, message: 'Project not found.', data: null };

  const systemInstruction = config.stylePrompt
    ? `${SYSTEM_PROMPT}\n\nHouse style: ${config.stylePrompt}`
    : SYSTEM_PROMPT;

  try {
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const response = await ai.models.generateContent({
      model: config.model,
      contents: `Write the deployment documentation for this project.\n\n${buildProjectContext(project)}`,
      config: { systemInstruction, temperature: 0.4 },
    });

    const html = stripCodeFences(response.text ?? '');
    if (!html) return { success: false, message: 'The AI returned an empty document.', data: null };

    const contentJson = generateJSON(html, tiptapExtensions);
    return { success: true, message: 'Generated.', data: { contentJson } };
  } catch (error) {
    return { success: false, message: interpretGeminiError(error).message, data: null };
  }
};
