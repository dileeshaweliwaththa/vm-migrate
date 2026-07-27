import { GoogleGenAI } from '@google/genai';
import { generateJSON } from '@tiptap/html';
import type { JSONContent } from '@tiptap/core';
import { getCurrentRole } from '@/services/auth/authService';
import { getGeminiConfig } from '@/services/settings/settingsService';
import { getProject } from '@/services/projects/projectService';
import { canEdit } from '@/lib/rbac';
import { tiptapExtensions } from '@/lib/tiptap/extensions';
import type { ApiSingleResponse } from '@/types/common';
import type { ProjectDetail } from '@/types/common/project';

// Service layer: AI documentation generation (Gemini). Reads the key server-side
// via getGeminiConfig (never exposed to the browser), builds a prompt from the
// project's structured data plus the admin's house-style prompt, calls Gemini,
// and converts the returned HTML into Tiptap JSON the editor can load. The
// result is editable before the user saves it. See phase-2-plan.md §7.

// A fixed section skeleton keeps every generated doc consistent in shape.
const SYSTEM_PROMPT = [
  'You are a senior platform engineer writing internal deployment documentation.',
  'Return a single self-contained HTML fragment — no <html>, <head>, <body>, no',
  'markdown code fences, no commentary before or after.',
  'Use ONLY these tags: h2, h3, p, ul, ol, li, strong, em, code, pre, blockquote, hr.',
  'Structure the document with these H2 sections in order: Overview, Architecture,',
  'Environments, Deployment, Ports, Runbook. Omit a section only if there is truly',
  'nothing to say. Be concise and factual; do not invent infrastructure that is not',
  'described in the provided data.',
].join(' ');

const buildProjectContext = (project: ProjectDetail): string => {
  const lines: string[] = [];
  lines.push(`Project name: ${project.name}`);
  if (project.tags.length) lines.push(`Tags: ${project.tags.join(', ')}`);
  if (project.description) lines.push(`Description: ${project.description}`);

  if (project.environments.length === 0) {
    lines.push('Environments: none defined yet.');
  } else {
    lines.push('Environments:');
    for (const env of project.environments) {
      const parts = [`- ${env.name}`, `CI/CD: ${env.cicdProvider}`];
      if (env.deployUrl) parts.push(`deploy URL: ${env.deployUrl}`);
      if (env.jenkinsUrl) parts.push(`Jenkins: ${env.jenkinsUrl}`);
      if (env.vmName) parts.push(`VM: ${env.vmName}`);
      if (env.notes) parts.push(`notes: ${env.notes}`);
      lines.push(`  ${parts.join(', ')}`);
      for (const port of env.ports) {
        const desc = port.description ? ` (${port.description})` : '';
        lines.push(`    · port ${port.port}/${port.protocol}${desc}`);
      }
    }
  }
  return lines.join('\n');
};

// Strips accidental markdown code fences the model sometimes wraps HTML in.
const stripCodeFences = (text: string): string =>
  text
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

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
    const message = error instanceof Error ? error.message : 'AI generation failed.';
    return { success: false, message, data: null };
  }
};
