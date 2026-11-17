import { describe, expect, it } from 'vitest';
import { extractPorts } from '@/services/jenkins/extraction';

// A freestyle job's shell step, as config.xml carries it: entity-encoded.
const job = (command: string) =>
  `<project><builders><hudson.tasks.Shell><command>${command}</command></hudson.tasks.Shell></builders></project>`;

describe('extractPorts', () => {
  it('maps the ports the patterns recognise', () => {
    const { ports, skipped } = extractPorts(job('docker run -d -p 8080:3000 app &amp;&amp; echo ok'));
    expect(ports.map((p) => [p.port, p.foundIn])).toEqual([['3000', 'docker -p mapping']]);
    expect(skipped).toEqual([]);
  });

  it('reports a matched number that is not a port instead of dropping it', () => {
    const { ports, skipped } = extractPorts(job('docker run -p 8080:123456 app'));
    expect(ports).toEqual([]);
    expect(skipped).toEqual([
      expect.objectContaining({ token: '123456', reason: 'out_of_range', foundIn: 'docker -p mapping' }),
    ]);
  });

  it('reports a port-like token no pattern claimed, with where it was', () => {
    const { ports, skipped } = extractPorts(
      job('curl --fail http://localhost:4000/health &amp;&amp; deploy.sh')
    );
    expect(ports).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ token: '4000', reason: 'no_pattern' });
    // Decoded, so it reads the way it does in the job's shell step.
    expect(skipped[0].context).toContain('http://localhost:4000/health && deploy.sh');
  });

  it('does not report a hint whose port a pattern already mapped', () => {
    const { ports, skipped } = extractPorts(
      job('EXPOSE 3000\ncurl http://localhost:3000/health')
    );
    expect(ports.map((p) => p.port)).toEqual(['3000']);
    expect(skipped).toEqual([]);
  });

  it('reports each skipped number once', () => {
    const { skipped } = extractPorts(job('curl localhost:5000; curl localhost:5000; curl localhost:5001'));
    expect(skipped.map((s) => s.token)).toEqual(['5000', '5001']);
  });

  // #28's acceptance: these two must be distinguishable.
  it('tells "nothing found" apart from "found things, mapped none"', () => {
    const nothing = extractPorts(job('npm ci &amp;&amp; npm run build'));
    const unmapped = extractPorts(job('EXPOSE 0\nnginx: listen 70000;'));

    expect(nothing).toEqual({ ports: [], skipped: [] });
    expect(unmapped.ports).toEqual([]);
    expect(unmapped.skipped.length).toBeGreaterThan(0);
    expect(unmapped.skipped.every((s) => s.reason === 'out_of_range')).toBe(true);
  });

  it('returns nothing for an empty config', () => {
    expect(extractPorts('')).toEqual({ ports: [], skipped: [] });
  });
});
