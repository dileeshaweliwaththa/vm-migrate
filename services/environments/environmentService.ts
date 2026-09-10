import {
  findEnvironmentById,
  insertEnvironment,
  updateEnvironment as updateEnvironmentRow,
  deleteEnvironment as deleteEnvironmentRow,
  type EnvironmentWriteColumns,
} from '@/repositories/environments/environmentRepository';
import {
  findEndpointsForVms,
  insertEndpoint,
  updateEndpoint,
  deleteEndpoint,
  type EndpointWriteColumns,
} from '@/repositories/endpoints/endpointRepository';
import { bareHost } from '@/lib/endpoints';
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
  // `jenkins_url` / `jenkins_username` are deliberately not writable from here —
  // they belong to `saveEnvironmentJenkinsConfig`, which owns the whole Jenkins
  // triple (URL, username, token) and SSRF-checks the target before storing it.
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

const portInputToColumns = (input: EnvironmentPortInput): EndpointWriteColumns => {
  const cols: EndpointWriteColumns = {};
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

// A VM-owned endpoint that already describes what is about to be added, and can
// therefore be *adopted* by the environment instead of duplicated.
//
// This is the runtime half of the table unification: the migration merged the
// historical overlap once, and without this, adding port 3300 from a project
// would put a second 3300 row under a VM that already had one from the tracker —
// the exact double entry the one-table change removed.
//
// Only VM-owned rows are candidates. A row that already belongs to an
// environment is somebody's record and is left alone.
//
// Matching is deliberately narrow, because **the same port on one host is
// legitimate**: an nginx box serves `admin.example.com:443` and
// `api.example.com:443` from the same port. So a match needs the same port and
// protocol *and* a compatible host — either the tracker row has no URL yet (the
// common case: a row added in the grid with the port filled in and the domain
// blank) or it names the same host as the record being added. Anything else is a
// different endpoint and gets its own row.
const findAdoptableEndpoint = async (
  vmId: string,
  port: string,
  protocol: string,
  domain: string
) => {
  const rows = await findEndpointsForVms([vmId]);
  return (
    rows.find(
      (row) =>
        !row.environment_id &&
        row.port === port &&
        (row.protocol || 'HTTPS') === protocol &&
        (!bareHost(row.domain) ||
          !bareHost(domain) ||
          bareHost(row.domain).toLowerCase() === bareHost(domain).toLowerCase())
    ) ?? null
  );
};

export const addPort = async (
  environmentId: string,
  input: EnvironmentPortInput
): Promise<EnvironmentPort> => {
  // Provenance: an explicit source wins (the docker import sets 'docker'),
  // otherwise a record carrying a Jenkins job is 'jenkins' and anything else is a
  // hand-added 'manual' row.
  const source: PortSource = input.source ?? (input.jenkinsJobUrl ? 'jenkins' : 'manual');
  const cols = portInputToColumns(input);

  // Adopt before inserting: if the tracker already has this endpoint as a
  // VM-owned row, it becomes this environment's record — keeping its id, its DNS
  // and tested ticks and its notes, none of which the project form asks for.
  // The environment has to have a VM for there to be anything to adopt, and a
  // blank port can't be matched on (branch-based providers have no port).
  const environment = input.port?.trim() ? await findEnvironmentById(environmentId) : null;
  if (environment?.vm_id) {
    const adoptable = await findAdoptableEndpoint(
      environment.vm_id,
      input.port?.trim() ?? '',
      input.protocol ?? 'HTTPS',
      input.domain ?? ''
    );
    if (adoptable) {
      const adopted = await updateEndpoint(adoptable.id, {
        environment_id: environmentId,
        // Exactly one parent — the CHECK rejects a row holding both.
        vm_id: null,
        source,
        ...cols,
      });
      return rowToPort(adopted);
    }
  }

  // `environment_id` set and `vm_id` left null: this is a project's record, and
  // the endpoints table allows exactly one parent. Its VM is whatever the
  // environment is on, resolved at read time rather than copied here — so the
  // tracker shows this row under that VM without a second source of truth.
  const row = await insertEndpoint({
    environment_id: environmentId,
    source,
    ...cols,
  });
  return rowToPort(row);
};

export const updatePort = async (
  id: string,
  input: EnvironmentPortInput
): Promise<EnvironmentPort> => {
  const row = await updateEndpoint(id, portInputToColumns(input));
  return rowToPort(row);
};

export const removePort = async (id: string): Promise<void> => {
  await deleteEndpoint(id);
};
