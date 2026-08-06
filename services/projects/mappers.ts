import type { ProjectRow } from '@/types/supabase/response/projects';
import type { EnvironmentRow } from '@/types/supabase/response/environments';
import type { EnvironmentPortRow } from '@/types/supabase/response/environmentPorts';
import type { Protocol } from '@/types/common/vm';
import { PORT_SOURCES } from '@/types/common/project';
import { deriveJenkinsBase, rebaseOnJenkinsServer } from '@/lib/jenkins-url';
import type {
  CicdProvider,
  Environment,
  EnvironmentName,
  EnvironmentPort,
  PortSource,
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

// `jenkinsBase` is the environment's Jenkins server root, when the caller has it.
// The stored job URL was captured from Jenkins' own API, so it names whatever host
// Jenkins' root-URL setting named at the time — which stops being reachable the
// moment the server moves. Re-mounting it here fixes every consumer at once (the
// row's link, the ▶ Run payload, and the job-list match behind Status / Last
// build) without a migration, and keeps working if the address changes again.
export const rowToPort = (row: EnvironmentPortRow, jenkinsBase = ''): EnvironmentPort => ({
  id: row.id,
  environmentId: row.environment_id,
  port: row.port,
  branch: row.branch ?? '',
  protocol: row.protocol as Protocol,
  description: row.description,
  domain: row.domain ?? '',
  // Validate against the enum rather than testing for 'jenkins' alone — an
  // explicit two-way check silently relabelled every `docker` row as `manual`,
  // which hid imported records from any by-source count.
  source: PORT_SOURCES.includes(row.source as PortSource)
    ? (row.source as PortSource)
    : 'manual',
  jenkinsJobUrl: rebaseOnJenkinsServer(row.jenkins_job_url ?? '', jenkinsBase),
  position: row.position,
});

export const rowToEnvironment = (row: EnvironmentRow): Environment => {
  // Derived once per environment, and passed down so a record always resolves
  // against the server root of the environment it belongs to.
  const jenkinsBase = deriveJenkinsBase(row.jenkins_url ?? '');
  return {
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
      .map((port) => rowToPort(port, jenkinsBase))
      .sort((a, b) => a.position - b.position),
  };
};

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';
