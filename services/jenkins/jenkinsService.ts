import { getCurrentRole } from '@/services/auth/authService';
import { getProject } from '@/services/projects/projectService';
import { extractPorts } from '@/services/jenkins/extraction';
import { fetchJobConfigXml } from '@/repositories/jenkins/jenkinsRepository';
import { updateEnvironment } from '@/repositories/environments/environmentRepository';
import {
  getEnvironmentToken,
  setEnvironmentToken,
  hasEnvironmentToken,
} from '@/repositories/environmentSecrets/environmentSecretRepository';
import { insertPort, deletePort } from '@/repositories/environmentPorts/environmentPortRepository';
import { canEdit } from '@/lib/rbac';
import type { ApiSingleResponse } from '@/types/common';
import type {
  EnvironmentJenkinsConfig,
  EnvironmentJenkinsInput,
  EnvironmentSyncResult,
} from '@/types/common/jenkins';
import type { Environment } from '@/types/common/project';

// Service layer: per-environment Jenkins integration (Phase 2b · M3). Editor+.
//
// Non-secret config (job URL, username) is stored on the environment; the secret
// API token is stored in environment_secrets and only ever read/written here via
// the service-role repository — it is never returned to the browser. The sync
// reads the environment's own job config and refreshes its jenkins-sourced ports
// (manual ports are preserved). See docs/jenkins-sync.md.

const asMsg = (error: unknown, fallback: string): string =>
  (error instanceof Error && error.message) || fallback;

const findEnv = async (
  projectId: string,
  envId: string
): Promise<Environment | undefined> => {
  const detail = await getProject(projectId);
  return detail?.environments.find((e) => e.id === envId);
};

// Public, secret-free config for the modal (token replaced by a boolean).
export const getEnvironmentJenkinsConfig = async (
  projectId: string,
  envId: string
): Promise<ApiSingleResponse<EnvironmentJenkinsConfig>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  const env = await findEnv(projectId, envId);
  if (!env) return { success: false, message: 'Environment not found.', data: null };

  try {
    const hasToken = await hasEnvironmentToken(envId);
    return {
      success: true,
      message: 'OK',
      data: { jenkinsUrl: env.jenkinsUrl, jenkinsUsername: env.jenkinsUsername, hasToken },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to load Jenkins config.'), data: null };
  }
};

export const saveEnvironmentJenkinsConfig = async (
  projectId: string,
  envId: string,
  input: EnvironmentJenkinsInput
): Promise<ApiSingleResponse<EnvironmentJenkinsConfig>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  const env = await findEnv(projectId, envId);
  if (!env) return { success: false, message: 'Environment not found.', data: null };

  try {
    // Non-secret parts on the environment; ensure the provider reflects Jenkins.
    await updateEnvironment(envId, {
      jenkins_url: input.jenkinsUrl.trim(),
      jenkins_username: input.jenkinsUsername.trim(),
      cicd_provider: 'jenkins',
    });
    // Secret token: only write when provided (undefined = keep stored value).
    if (input.jenkinsApiToken !== undefined) {
      await setEnvironmentToken(envId, input.jenkinsApiToken.trim());
    }
    const hasToken = await hasEnvironmentToken(envId);
    return {
      success: true,
      message: 'Jenkins settings saved.',
      data: {
        jenkinsUrl: input.jenkinsUrl.trim(),
        jenkinsUsername: input.jenkinsUsername.trim(),
        hasToken,
      },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Failed to save Jenkins config.'), data: null };
  }
};

// Per-environment sync (editor+). Reads the environment's own Jenkins job URL +
// username, and the token from the server-only secrets store, pulls the job
// config, extracts ports best-effort, and replaces only the `jenkins`-sourced
// ports (manual entries preserved). The token is never exposed to the client.
export const syncEnvironmentPorts = async (
  projectId: string,
  envId: string
): Promise<ApiSingleResponse<EnvironmentSyncResult>> => {
  const role = await getCurrentRole();
  if (!canEdit(role)) return { success: false, message: 'Editor access required.', data: null };

  const env = await findEnv(projectId, envId);
  if (!env) return { success: false, message: 'Environment not found.', data: null };
  if (!env.jenkinsUrl.trim()) {
    return { success: false, message: 'Set the Jenkins job URL first (Jenkins settings).', data: null };
  }

  try {
    const apiToken = await getEnvironmentToken(envId);
    if (!apiToken) {
      return { success: false, message: 'No Jenkins API token set for this environment.', data: null };
    }

    const xml = await fetchJobConfigXml(
      { username: env.jenkinsUsername, apiToken },
      env.jenkinsUrl
    );
    if (xml === null) {
      return {
        success: false,
        message: 'Could not read the Jenkins job config — check the URL, credentials, and permissions.',
        data: null,
      };
    }

    const ports = extractPorts(xml);

    // Replace only the jenkins-sourced ports; keep manual ones.
    for (const p of env.ports.filter((p) => p.source === 'jenkins')) {
      await deletePort(p.id);
    }
    let position = env.ports.filter((p) => p.source !== 'jenkins').length;
    for (const p of ports) {
      await insertPort({
        environment_id: envId,
        port: p.port,
        protocol: p.protocol,
        description: p.description,
        source: 'jenkins',
        position: position++,
      });
    }

    return {
      success: true,
      message: ports.length
        ? `Synced ${ports.length} port(s) from Jenkins.`
        : 'Connected, but no ports were detected in the job config.',
      data: { ports, written: ports.length },
    };
  } catch (error) {
    return { success: false, message: asMsg(error, 'Jenkins sync failed.'), data: null };
  }
};
