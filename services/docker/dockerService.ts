import { getCurrentRole } from '@/services/auth/authService';
import { getProject } from '@/services/projects/projectService';
import { parseDockerPs } from '@/services/docker/dockerPs';
import { canEdit } from '@/lib/rbac';
import type { ApiSingleResponse } from '@/types/common';
import type { DockerCandidate, DockerParseResult } from '@/types/common/docker';

// Service layer: turning pasted `docker ps` output into importable records.
//
// Preview only — this never writes. The UI imports a chosen candidate through the
// existing ports endpoint with source='docker', so there's one write path for
// records rather than a second one here. See docs/docker-import.md.

// A `docker ps` listing is a screenful, not a document — a few hundred containers
// would still be well inside this. The cap is here because the parser runs
// line-by-line regexes over whatever arrives in the request body, and route
// handlers have no body-size limit of their own: without it, one very large paste
// is CPU spent for nothing. Rejected with a message rather than truncated, so a
// genuinely huge paste isn't silently half-imported.
const MAX_OUTPUT_CHARS = 200_000;

export const previewDockerImport = async (
  projectId: string,
  envId: string,
  output: string
): Promise<ApiSingleResponse<DockerParseResult>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  if (!output.trim()) {
    return { success: false, message: 'Paste the output of `docker ps` first.', data: null };
  }
  if (output.length > MAX_OUTPUT_CHARS) {
    return {
      success: false,
      message: `That paste is too large (${Math.round(output.length / 1000)}k characters). Paste the output of a single \`docker ps\`.`,
      data: null,
    };
  }

  const detail = await getProject(projectId);
  const env = detail?.environments.find((e) => e.id === envId);
  if (!env) return { success: false, message: 'Environment not found.', data: null };

  const { containers, unparsed } = parseDockerPs(output);

  // Host ports the environment already records, whatever their provenance — a
  // manually typed 3000 counts as tracked, so an import never duplicates it.
  const existingPorts = new Set(env.ports.map((p) => p.port).filter(Boolean));

  const candidates: DockerCandidate[] = [];
  for (const container of containers) {
    for (const mapping of container.ports) {
      candidates.push({
        key: `${container.containerId || container.name}:${mapping.hostPort}`,
        // One container publishing several ports would otherwise produce rows with
        // identical names; the container port disambiguates them.
        name:
          container.ports.length > 1
            ? `${container.name}:${mapping.containerPort}`
            : container.name,
        port: mapping.hostPort,
        containerPort: mapping.containerPort,
        protocol: mapping.protocol,
        image: container.image,
        status: container.status,
        tracked: existingPorts.has(mapping.hostPort),
      });
    }
  }

  // Understood, but nothing to import — reported rather than dropped, so a
  // container the user expected to see is accounted for.
  const skipped = containers.filter((c) => c.ports.length === 0);

  const importable = candidates.filter((c) => !c.tracked).length;
  const message = candidates.length
    ? `Found ${candidates.length} published port(s) — ${importable} new.`
    : 'No published ports found in that output.';

  return { success: true, message, data: { candidates, skipped, unparsed } };
};
