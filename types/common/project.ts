import type { Protocol } from '@/types/common/vm';

// Domain types for the deployment platform (Phase 2). camelCase; the service
// layer maps snake_case Supabase rows into these.

export const CICD_PROVIDERS = ['jenkins', 'aws', 'azure', 'amplify', 'other', 'none'] as const;
export type CicdProvider = (typeof CICD_PROVIDERS)[number];

export interface EnvironmentPort {
  id: string;
  environmentId: string;
  port: string;
  protocol: Protocol;
  description: string;
  source: 'manual' | 'jenkins';
  position: number;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  cicdProvider: CicdProvider;
  jenkinsUrl: string;
  deployUrl: string;
  vmId: string | null;
  vmName: string | null;
  notes: string;
  position: number;
  ports: EnvironmentPort[];
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  client: string;
  description: string;
  repoUrl: string;
  cicdProvider: CicdProvider;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  environmentCount: number;
}

export interface ProjectDetail extends Project {
  environments: Environment[];
}

export type ProjectInput = Partial<
  Pick<Project, 'name' | 'slug' | 'client' | 'description' | 'repoUrl' | 'cicdProvider'>
>;

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
  Pick<EnvironmentPort, 'port' | 'protocol' | 'description' | 'position'>
>;
