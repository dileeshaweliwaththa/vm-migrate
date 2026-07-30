import type { Protocol } from '@/types/common/vm';

// Domain types for the deployment platform (Phase 2). camelCase; the service
// layer maps snake_case Supabase rows into these.

export const CICD_PROVIDERS = ['jenkins', 'aws', 'azure', 'amplify', 'other', 'none'] as const;
export type CicdProvider = (typeof CICD_PROVIDERS)[number];

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
  deployUrl: string;
  vmId: string | null;
  vmName: string | null;
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

export type EnvironmentInput = Partial<
  Pick<Environment, 'name' | 'cicdProvider' | 'jenkinsUrl' | 'deployUrl' | 'vmId' | 'notes' | 'position'>
> & { newVm?: InlineVmInput };

export type EnvironmentPortInput = Partial<
  Pick<
    EnvironmentPort,
    'port' | 'protocol' | 'description' | 'domain' | 'position' | 'jenkinsJobUrl' | 'source'
  >
>;
