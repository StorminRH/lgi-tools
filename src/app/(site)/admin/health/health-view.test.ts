import { expect, test } from 'vitest';
import { deriveServiceLevels, failureResultLabel } from './health-view';

test('deriveServiceLevels is all green when healthy, and formats each value against its target and names the owner', () => {
  const healthy = deriveServiceLevels({ readSuccess: 0.999, mutationSuccess: 1, latencyP95: 420, esiSuccess: 0.99 });
  expect(healthy.every((row) => row.level === 'green')).toBe(true);

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

test('failureResultLabel adds the code and error class only where they say something new, with no dangling separator', () => {
  const group = { feature: 'planner', operation: 'read', count: 1, lastSeen: new Date('2026-07-01T00:00:00Z') };
  expect(failureResultLabel({ ...group, outcome: 'failed', code: 'ETIMEDOUT', errorClass: 'FetchError' })).toBe(
    'failed · ETIMEDOUT · FetchError',
  );
  expect(failureResultLabel({ ...group, outcome: 'rate_limited', code: 'rate_limited', errorClass: null })).toBe(
    'rate_limited',
  );
  expect(failureResultLabel({ ...group, outcome: 'timeout', code: null, errorClass: null })).toBe('timeout');
  expect(failureResultLabel({ ...group, outcome: 'timeout', code: null, errorClass: 'AbortError' })).toBe(
    'timeout · AbortError',
  );
});
