import type { ProjectRow } from '@/types/supabase/response/projects';
import type { EnvironmentRow } from '@/types/supabase/response/environments';
import type { EndpointRow } from '@/types/supabase/response/endpoints';
import type { VmSummaryRow } from '@/types/supabase/response/vms';
import type { Protocol } from '@/types/common/vm';
import { ENVIRONMENT_NAMES, PORT_SOURCES } from '@/types/common/project';
import { deriveJenkinsBase, rebaseOnJenkinsServer } from '@/lib/jenkins-url';
import { vmLiveIp } from '@/lib/endpoints';
import type {
  CicdProvider,
  Environment,
  EnvironmentName,
  EnvironmentPort,
  PortSource,
  Project,
  ProjectEnvironmentSummary,
} from '@/types/common/project';

// Shared row -> domain mappers for the projects/environments slice. Kept in one
// place so both projectService and environmentService map consistently.

// A set of environment rows as the project list wants them: name, the VM behind
// each one, and its live address. Takes rows rather than mapped `Environment`s
// because `migrated` (which decides the live IP) is on the joined VM and never
// reaches the domain type.
//
// Sorted by **lifecycle** — DEV, STAGE, PRODUCTION, the order `ENVIRONMENT_NAMES`
// declares — not by each project's own `position`. The list card shows a dozen of
// these side by side, and per-project ordering meant DEV led one card's hover and
// trailed the next one's; a fixed order is what makes them comparable at a
// glance. The project's own page still honours `position`.
export const collectProjectEnvironments = (
  rows: {
    id: string;
    name: string;
    vm_id: string | null;
    vms?: VmSummaryRow | null;
  }[]
): ProjectEnvironmentSummary[] =>
  [...rows]
    .sort(
      (a, b) =>
        ENVIRONMENT_NAMES.indexOf(a.name as EnvironmentName) -
          ENVIRONMENT_NAMES.indexOf(b.name as EnvironmentName) ||
        // Two environments can share a name (two PRODUCTIONs on different hosts),
        // so the machine breaks the tie and the pair keeps a stable order.
        (a.vms?.name ?? '').localeCompare(b.vms?.name ?? '')
    )
    .map((row) => ({
      id: row.id,
      name: row.name as EnvironmentName,
      vmName: row.vm_id ? row.vms?.name ?? '' : '',
      vmIp: row.vms
        ? vmLiveIp({
            oldIp: row.vms.old_ip ?? '',
            newIp: row.vms.new_ip ?? '',
            migrated: row.vms.migrated ?? false,
          })
        : '',
    }));

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
  // Both derived from the same embed, so a write-path select that doesn't ask for
  // environments yields 0 and `[]` together — never a count without its breakdown.
  environmentCount: row.environments?.length ?? 0,
  environmentSummaries: collectProjectEnvironments(row.environments ?? []),
});

// `jenkinsBase` is the environment's Jenkins server root, when the caller has it.
// The stored job URL was captured from Jenkins' own API, so it names whatever host
// Jenkins' root-URL setting named at the time — which stops being reachable the
// moment the server moves. Re-mounting it here fixes every consumer at once (the
// row's link, the ▶ Run payload, and the job-list match behind Status / Last
// build) without a migration, and keeps working if the address changes again.
export const rowToPort = (row: EndpointRow, jenkinsBase = ''): EnvironmentPort => ({
  id: row.id,
  // Non-null for every row that reaches this mapper: it only ever maps a
  // project's own records, which are the rows that carry an environment.
  environmentId: row.environment_id ?? '',
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
    // Resolving this needs a look at the environment's VM siblings and their
    // tokens, which is more than a row mapper should do. `false` is the safe
    // default — it only ever hides an affordance; `annotateJenkinsInheritance`
    // turns it on where it applies.
    jenkinsInherited: false,
    deployUrl: row.deploy_url,
    vmId: row.vm_id,
    vmName: row.vms?.name ?? null,
    // Resolved here rather than in the UI so every consumer of an environment
    // (the records table, the docs generator) reads the same address.
    vmIp: row.vms
      ? vmLiveIp({
          oldIp: row.vms.old_ip ?? '',
          newIp: row.vms.new_ip ?? '',
          migrated: row.vms.migrated ?? false,
        }) || null
      : null,
    notes: row.notes,
    position: row.position,
    ports: (row.endpoints ?? [])
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
