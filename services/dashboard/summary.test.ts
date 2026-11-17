import { describe, expect, it } from 'vitest';
import { buildDashboardSummary, parseDashboardFilters, type DashboardInputs } from '@/services/dashboard/summary';
import type { Environment, EnvironmentPort, Project } from '@/types/common/project';
import type { EnvironmentBuildRun } from '@/types/common/jenkins';
import type { Vm } from '@/types/common/vm';

const project = (id: string, tags: string[], archived = false) =>
  ({ id, tags, archived }) as Project;

const env = (id: string, projectId: string, vmId: string | null, ports = 1) =>
  ({
    id,
    projectId,
    vmId,
    name: 'DEV',
    cicdProvider: 'jenkins',
    jenkinsUrl: '',
    ports: Array.from({ length: ports }, (_, i) => ({
      id: `${id}-p${i}`,
      port: '',
      domain: '',
      defaultDomain: '',
      protocol: 'HTTPS',
      source: 'manual',
    })) as EnvironmentPort[],
  }) as unknown as Environment;

const vm = (id: string, migrated: boolean) =>
  ({ id, migrated, isSupabase: false, keep: false, urls: [] }) as unknown as Vm;

const run = (environmentId: string, result: string | null, phase = 'DONE') =>
  ({ environmentId, result, phase }) as EnvironmentBuildRun;

// Two clients. ACME has one project on vm-1; Globex has one on vm-2; one
// untagged project has an environment on no VM.
const inputs: DashboardInputs = {
  projects: [project('p1', ['ACME']), project('p2', ['Globex']), project('p3', [])],
  environments: [env('e1', 'p1', 'vm-1', 2), env('e2', 'p2', 'vm-2'), env('e3', 'p3', null)],
  vms: [vm('vm-1', true), vm('vm-2', false), vm('vm-3', false)],
  runs: [run('e1', 'SUCCESS'), run('e2', 'FAILURE'), run('e2', null, 'RUNNING')],
  runsCapped: false,
};

describe('buildDashboardSummary', () => {
  it('counts the whole workspace with no client', () => {
    const s = buildDashboardSummary(inputs, { client: null, days: 7 });
    expect(s.projects.total).toBe(3);
    expect(s.environments.total).toBe(3);
    expect(s.records.total).toBe(4);
    expect(s.migration[0]).toEqual({ label: 'VMs migrated', done: 1, total: 3 });
    expect(s.builds.inWindow).toMatchObject({ days: 7, total: 3, succeeded: 1, failed: 1, inFlight: 1 });
  });

  it("narrows everything to one client's projects", () => {
    const s = buildDashboardSummary(inputs, { client: 'Globex', days: 30 });
    expect(s.filters).toEqual({ client: 'Globex', days: 30 });
    expect(s.projects.total).toBe(1);
    expect(s.environments.total).toBe(1);
    expect(s.records.total).toBe(1);
    // Only the VM Globex's environment runs on.
    expect(s.migration[0]).toEqual({ label: 'VMs migrated', done: 0, total: 1 });
    expect(s.builds.inWindow).toMatchObject({ days: 30, total: 2, failed: 1, inFlight: 1 });
  });

  it('keeps offering every client while filtered', () => {
    const s = buildDashboardSummary(inputs, { client: 'ACME', days: 7 });
    expect(s.projects.clients).toEqual(['ACME', 'Globex']);
  });

  it('falls back to every client for a tag nobody has, and says so', () => {
    const s = buildDashboardSummary(inputs, { client: 'Initech', days: 7 });
    expect(s.filters.client).toBeNull();
    expect(s.projects.total).toBe(3);
  });

  it('marks a capped build window', () => {
    const s = buildDashboardSummary({ ...inputs, runsCapped: true }, { client: null, days: 90 });
    expect(s.builds.inWindow.capped).toBe(true);
  });
});

describe('parseDashboardFilters', () => {
  it('reads a client and a known window', () => {
    expect(parseDashboardFilters({ client: ' ACME ', days: '90' })).toEqual({ client: 'ACME', days: 90 });
  });

  it('falls back to every client and 7 days', () => {
    expect(parseDashboardFilters({ client: '', days: '45' })).toEqual({ client: null, days: 7 });
    expect(parseDashboardFilters({})).toEqual({ client: null, days: 7 });
  });
});
