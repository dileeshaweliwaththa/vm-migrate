import type { ProjectRow } from '@/types/supabase/response/projects';
import type { EnvironmentRow } from '@/types/supabase/response/environments';
import type { EnvironmentPortRow } from '@/types/supabase/response/environmentPorts';
import type { Protocol } from '@/types/common/vm';
import type {
  CicdProvider,
  Environment,
  EnvironmentName,
  EnvironmentPort,
  Project,
} from '@/types/common/project';

// Shared row -> domain mappers for the projects/environments slice. Kept in one
// place so both projectService and environmentService map consistently.

export const rowToProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  tags: (row.project_tags ?? [])
    .map((pt) => pt.tags?.name)
    .filter((n): n is string => Boolean(n))
    .sort(),
  archived: row.archived,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  environmentCount: row.environments?.[0]?.count ?? 0,
});

export const rowToPort = (row: EnvironmentPortRow): EnvironmentPort => ({
  id: row.id,
  environmentId: row.environment_id,
  port: row.port,
  protocol: row.protocol as Protocol,
  description: row.description,
  source: row.source === 'jenkins' ? 'jenkins' : 'manual',
  jenkinsJobUrl: row.jenkins_job_url ?? '',
  position: row.position,
});

export const rowToEnvironment = (row: EnvironmentRow): Environment => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name as EnvironmentName,
  cicdProvider: row.cicd_provider as CicdProvider,
  jenkinsUrl: row.jenkins_url,
  jenkinsUsername: row.jenkins_username ?? '',
  deployUrl: row.deploy_url,
  vmId: row.vm_id,
  vmName: row.vms?.name ?? null,
  notes: row.notes,
  position: row.position,
  ports: (row.environment_ports ?? [])
    .map(rowToPort)
    .sort((a, b) => a.position - b.position),
});

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';
