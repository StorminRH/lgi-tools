import { describe, expect, it } from 'vitest';
import { deriveServiceLevels, failureResultLabel } from './health-view';

const healthy = { readSuccess: 0.999, mutationSuccess: 1, latencyP95: 420, esiSuccess: 0.99 };

describe('deriveServiceLevels', () => {
  it('is all green when every indicator is healthy', () => {
    const rows = deriveServiceLevels(healthy);
    expect(rows.every((row) => row.level === 'green')).toBe(true);
  });

  it('formats values against their targets and names the owner', () => {
    const rows = deriveServiceLevels(
      { readSuccess: 0.9876, mutationSuccess: null, latencyP95: 3200.4, esiSuccess: 0.9 },
    );
    expect(rows.map((row) => [row.value, row.note, row.level, row.owner])).toEqual([
      ['98.8%', 'target ≥ 99%', 'amber', 'you'],
      ['no data', 'target ≥ 99%', 'neutral', 'you'],
      ['3,200 ms', 'target ≤ 1,500 ms', 'red', 'you'],
      ['90.0%', 'target ≥ 95%', 'amber', 'upstream'],
    ]);
  });
});

describe('failureResultLabel', () => {
  const group = { feature: 'planner', operation: 'read', count: 1, lastSeen: new Date('2026-07-01T00:00:00Z') };

  it('adds the code and error class only where they say something new', () => {
    expect(failureResultLabel({ ...group, outcome: 'failed', code: 'ETIMEDOUT', errorClass: 'FetchError' })).toBe(
      'failed · ETIMEDOUT · FetchError',
    );
    expect(failureResultLabel({ ...group, outcome: 'rate_limited', code: 'rate_limited', errorClass: null })).toBe(
      'rate_limited',
    );
  });

  it('leaves no dangling separator when a failure recorded no code', () => {
    expect(failureResultLabel({ ...group, outcome: 'timeout', code: null, errorClass: null })).toBe('timeout');
    expect(failureResultLabel({ ...group, outcome: 'timeout', code: null, errorClass: 'AbortError' })).toBe(
      'timeout · AbortError',
    );
  });
});
