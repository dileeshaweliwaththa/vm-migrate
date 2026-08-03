import {
  insertEnvironment,
  updateEnvironment as updateEnvironmentRow,
  deleteEnvironment as deleteEnvironmentRow,
  type EnvironmentWriteColumns,
} from '@/repositories/environments/environmentRepository';
import {
  insertPort,
  updatePort as updatePortRow,
  deletePort as deletePortRow,
  type EnvironmentPortWriteColumns,
} from '@/repositories/environmentPorts/environmentPortRepository';
import { createVm } from '@/services/vms/vmService';
import { rowToEnvironment, rowToPort } from '@/services/projects/mappers';
import type {
  Environment,
  EnvironmentInput,
  EnvironmentPort,
  EnvironmentPortInput,
  PortSource,
} from '@/types/common/project';

// Service layer: environments and their ports. Reuses the VM tracker's
// vmService to create a linked VM inline (no duplicate VM write path), so a VM
// created from an environment also appears in the tracker. RLS enforces the
// editor/admin write rule.

const envInputToColumns = (input: EnvironmentInput): EnvironmentWriteColumns => {
  const cols: EnvironmentWriteColumns = {};
  if (input.name !== undefined) cols.name = input.name;
  if (input.cicdProvider !== undefined) cols.cicd_provider = input.cicdProvider;
  if (input.jenkinsUrl !== undefined) cols.jenkins_url = input.jenkinsUrl;
  if (input.deployUrl !== undefined) cols.deploy_url = input.deployUrl;
  if (input.vmId !== undefined) cols.vm_id = input.vmId;
  if (input.notes !== undefined) cols.notes = input.notes;
  if (input.position !== undefined) cols.position = input.position;
  return cols;
};

// Creates the inline VM (if requested) and returns its id to link as vm_id.
const resolveVmId = async (input: EnvironmentInput): Promise<string | undefined> => {
  if (!input.newVm) return undefined;
  const vm = await createVm({
    name: input.newVm.name,
    oldIp: input.newVm.oldIp,
    newIp: input.newVm.newIp,
    isClient: input.newVm.isClient,
  });
  return vm.id;
};

export const addEnvironment = async (
  projectId: string,
  input: EnvironmentInput
): Promise<Environment> => {
  const cols = envInputToColumns(input);
  cols.project_id = projectId;
  const newVmId = await resolveVmId(input);
  if (newVmId) cols.vm_id = newVmId;
  const row = await insertEnvironment(cols);
  return rowToEnvironment(row);
};

export const updateEnvironment = async (
  id: string,
  input: EnvironmentInput
): Promise<Environment> => {
  const cols = envInputToColumns(input);
  const newVmId = await resolveVmId(input);
  if (newVmId) cols.vm_id = newVmId;
  const row = await updateEnvironmentRow(id, cols);
  return rowToEnvironment(row);
};

export const removeEnvironment = async (id: string): Promise<void> => {
  await deleteEnvironmentRow(id);
};

const portInputToColumns = (input: EnvironmentPortInput): EnvironmentPortWriteColumns => {
  const cols: EnvironmentPortWriteColumns = {};
  if (input.port !== undefined) cols.port = input.port;
  // Branch names can't contain whitespace, so a trailing space is always a typo
  // (or a paste artefact) rather than part of the name.
  if (input.branch !== undefined) cols.branch = input.branch.trim();
  if (input.protocol !== undefined) cols.protocol = input.protocol;
  if (input.description !== undefined) cols.description = input.description;
  // Domains are pasted as often as typed — trim so a stray space doesn't become
  // part of the host.
  if (input.domain !== undefined) cols.domain = input.domain.trim();
  if (input.jenkinsJobUrl !== undefined) cols.jenkins_job_url = input.jenkinsJobUrl;
  if (input.position !== undefined) cols.position = input.position;
  return cols;
};

export const addPort = async (
  environmentId: string,
  input: EnvironmentPortInput
): Promise<EnvironmentPort> => {
  // Provenance: an explicit source wins (the docker import sets 'docker'),
  // otherwise a record carrying a Jenkins job is 'jenkins' and anything else is a
  // hand-added 'manual' row.
  const source: PortSource = input.source ?? (input.jenkinsJobUrl ? 'jenkins' : 'manual');
  const row = await insertPort({
    environment_id: environmentId,
    source,
    ...portInputToColumns(input),
  });
  return rowToPort(row);
};

export const updatePort = async (
  id: string,
  input: EnvironmentPortInput
): Promise<EnvironmentPort> => {
  const row = await updatePortRow(id, portInputToColumns(input));
  return rowToPort(row);
};

export const removePort = async (id: string): Promise<void> => {
  await deletePortRow(id);
};
