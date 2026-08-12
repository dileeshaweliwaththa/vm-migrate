import type { Protocol } from '@/types/common/vm';

// Domain types for the deployment platform (Phase 2). camelCase; the service
// layer maps snake_case Supabase rows into these.

export const CICD_PROVIDERS = ['jenkins', 'aws', 'azure', 'amplify', 'other', 'none'] as const;
export type CicdProvider = (typeof CICD_PROVIDERS)[number];

// Managed platforms don't deploy *a port on a host* — an Amplify deployment is a
// branch, AWS/Azure ones are services behind their own endpoints. A record there
// is a name + domain, so the Port column (and the `docker ps` import, which is
// nothing but host ports) doesn't apply. `other` and `none` keep ports: those are
// the hand-tracked, VM-hosted records.
export const PORTLESS_PROVIDERS: readonly CicdProvider[] = ['aws', 'azure', 'amplify'];

export const providerHasPorts = (provider: CicdProvider): boolean =>
  !PORTLESS_PROVIDERS.includes(provider);

// The flip side: what a managed-platform record *does* identify itself by. Port
// and branch are alternatives per provider, never both — one switch, two columns.
export const providerHasBranch = (provider: CicdProvider): boolean =>
  PORTLESS_PROVIDERS.includes(provider);

// Provenance of a port row (mirrors the `port_source` DB enum — same values, same
// order). 'docker' rows come from pasted `docker ps` output; see
// docs/docker-import.md.
export const PORT_SOURCES = ['manual', 'jenkins', 'docker'] as const;
export type PortSource = (typeof PORT_SOURCES)[number];

// Fixed environment names (mirrors the `environment_name` DB enum).
export const ENVIRONMENT_NAMES = ['DEV', 'STAGE', 'PRODUCTION'] as const;
export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export interface EnvironmentPort {
  id: string;
  environmentId: string;
  port: string;
  // The deployed branch — what identifies a record on a managed platform, where
  // there is no host port. Empty on port-bearing providers. See
  // providerHasBranch.
  branch: string;
  protocol: Protocol;
  // The record's label — a Jenkins job name for jenkins-linked records, or a
  // hand-typed name for manual ones. Surfaced as the "Name" column.
  description: string;
  // The domain/host this record is served on, e.g. `dev.imaui.upview.tech`.
  domain: string;
  source: PortSource;
  jenkinsJobUrl: string;
  position: number;
}

export interface Environment {
  id: string;
  projectId: string;
  name: EnvironmentName;
  cicdProvider: CicdProvider;
  jenkinsUrl: string;
  jenkinsUsername: string;
  // True when this environment has **no** Jenkins server of its own but sits on a
  // VM that can lend one — another environment on that VM has a server, a user
  // and a token. A VM runs one Jenkins, so the server is the VM's property and
  // only the *job* is this environment's; that is what makes "browse jobs" usable
  // before this environment has been configured at all.
  //
  // Set by `annotateJenkinsInheritance`, not by the row mapper — it takes queries
  // the mapper has no business making, so anything built straight from a row gets
  // `false`. Never a reason to skip a server-side check: the resolver re-derives
  // the donor itself.
  jenkinsInherited: boolean;
  deployUrl: string;
  vmId: string | null;
  vmName: string | null;
  // The linked VM's current address (see `vmLiveIp`), or null when no VM is
  // linked or it has no IP yet. Joined onto the environment because a record's
  // direct URL is that address plus the record's own port.
  vmIp: string | null;
  notes: string;
  position: number;
  ports: EnvironmentPort[];
}

export interface Tag {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  tags: string[];
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  environmentCount: number;
}

export interface ProjectDetail extends Project {
  environments: Environment[];
}

export type ProjectInput = Partial<Pick<Project, 'name' | 'slug' | 'description'>> & {
  tags?: string[];
};

// A new VM created inline from the environment form (subset of the VM tracker's
// fields). The service creates it via vmService, then links it as vm_id.
export interface InlineVmInput {
  name: string;
  oldIp?: string;
  newIp?: string;
  isClient?: boolean;
}

// Note what is **not** here: `jenkinsUrl` (and `jenkinsUsername`). Jenkins
// configuration is one unit — server/job URL, username, token — and the token can
// only be written by `saveEnvironmentJenkinsConfig`, which is also the only writer
// of the other two. Accepting a URL here as well would give one field two write
// paths, one of which skips the SSRF check on the target. See docs/jenkins-sync.md.
export type EnvironmentInput = Partial<
  Pick<Environment, 'name' | 'cicdProvider' | 'deployUrl' | 'vmId' | 'notes' | 'position'>
> & { newVm?: InlineVmInput };

export type EnvironmentPortInput = Partial<
  Pick<
    EnvironmentPort,
    | 'port'
    | 'branch'
    | 'protocol'
    | 'description'
    | 'domain'
    | 'position'
    | 'jenkinsJobUrl'
    | 'source'
  >
>;
