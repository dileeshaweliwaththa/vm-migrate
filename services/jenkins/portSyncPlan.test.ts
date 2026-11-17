import { describe, expect, it } from 'vitest';
import { planPortSync } from '@/services/jenkins/portSyncPlan';
import type { EnvironmentPort } from '@/types/common/project';
import type { ExtractedPort } from '@/types/common/jenkins';

const record = (
  id: string,
  port: string,
  source: EnvironmentPort['source'],
  protocol: EnvironmentPort['protocol'] = 'HTTPS'
): EnvironmentPort =>
  ({ id, port, protocol, source, description: '', domain: '' }) as EnvironmentPort;

const found = (port: string, protocol: ExtractedPort['protocol'] = 'HTTPS'): ExtractedPort => ({
  port,
  protocol,
  description: `Detected (${port})`,
  foundIn: 'test',
});

describe('planPortSync', () => {
  it('splits records into added, unchanged, removed and kept', () => {
    const plan = planPortSync(
      [
        record('a', '3000', 'jenkins'),
        record('b', '4000', 'jenkins'),
        record('m', '5000', 'manual'),
        record('d', '6000', 'docker'),
      ],
      [found('3000'), found('8080')]
    );

    expect(plan.added.map((p) => p.port)).toEqual(['8080']);
    expect(plan.unchanged.map((r) => r.id)).toEqual(['a']);
    expect(plan.removed.map((r) => r.id)).toEqual(['b']);
    expect(plan.kept.map((r) => r.id)).toEqual(['m', 'd']);
  });

  it('never removes a manual or docker record, even for a port the job no longer has', () => {
    const plan = planPortSync([record('m', '5000', 'manual'), record('d', '6000', 'docker')], []);
    expect(plan.removed).toEqual([]);
    expect(plan.kept).toHaveLength(2);
  });

  // #33's acceptance: applying twice with the same job config is a no-op.
  it('plans nothing the second time round', () => {
    const existing = [record('a', '3000', 'jenkins'), record('b', '4000', 'jenkins')];
    const extracted = [found('3000'), found('8080')];
    const first = planPortSync(existing, extracted);

    // What apply leaves behind: the unchanged and kept records, plus the added ones.
    const afterApply = [
      ...first.kept,
      ...first.unchanged,
      ...first.added.map((port, i) => record(`new-${i}`, port.port, 'jenkins', port.protocol)),
    ];
    const second = planPortSync(afterApply, extracted);

    expect(second.added).toEqual([]);
    expect(second.removed).toEqual([]);
    expect(second.fingerprint).toBe('');
  });

  it('treats a protocol change as a removal and an addition', () => {
    const plan = planPortSync([record('a', '80', 'jenkins', 'HTTPS')], [found('80', 'HTTP')]);
    expect(plan.removed.map((r) => r.id)).toEqual(['a']);
    expect(plan.added.map((p) => `${p.port}/${p.protocol}`)).toEqual(['80/HTTP']);
  });

  it('matches 0080 and 80 as the same port', () => {
    const plan = planPortSync([record('a', '0080', 'jenkins')], [found('80')]);
    expect(plan.unchanged.map((r) => r.id)).toEqual(['a']);
    expect(plan.added).toEqual([]);
  });

  it('removes a duplicate synced record, keeping the first', () => {
    const plan = planPortSync(
      [record('a', '3000', 'jenkins'), record('a2', '3000', 'jenkins')],
      [found('3000')]
    );
    expect(plan.unchanged.map((r) => r.id)).toEqual(['a']);
    expect(plan.removed.map((r) => r.id)).toEqual(['a2']);
  });

  it('fingerprints the change, not the order it was listed in', () => {
    const existing = [record('a', '1000', 'jenkins'), record('b', '2000', 'jenkins')];
    const one = planPortSync(existing, [found('3000'), found('4000')]);
    const two = planPortSync([...existing].reverse(), [found('4000'), found('3000')]);
    expect(one.fingerprint).toBe(two.fingerprint);
    expect(one.fingerprint).not.toBe(planPortSync(existing, [found('3000')]).fingerprint);
  });
});
