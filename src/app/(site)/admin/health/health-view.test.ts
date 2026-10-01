import { describe, expect, it } from 'vitest';
import {
  dayLabel,
  deriveServiceLevels,
  failureResultLabel,
  operationLabel,
  slowOperationNote,
} from './health-view';

const healthy = { readSuccess: 0.999, mutationSuccess: 1, latencyP95: 420, esiSuccess: 0.99 };
const idleQueue = { due: 0, deadLettered: 0, oldestDueHours: null };

describe('deriveServiceLevels', () => {
  it('is all green when every indicator is healthy', () => {
    const rows = deriveServiceLevels(healthy, idleQueue);
    expect(rows.every((row) => row.level === 'green')).toBe(true);
  });

  it('formats values against their targets and names the owner', () => {
    const rows = deriveServiceLevels(
      { readSuccess: 0.9876, mutationSuccess: null, latencyP95: 3200.4, esiSuccess: 0.9 },
      idleQueue,
    );
    expect(rows.map((row) => [row.value, row.target, row.level, row.owner])).toEqual([
      ['98.8%', '≥ 99%', 'amber', 'you'],
      ['no data', '≥ 99%', 'neutral', 'you'],
      ['3,200 ms', '≤ 1,500 ms', 'red', 'you'],
      ['90.0%', '≥ 95%', 'amber', 'upstream'],
      ['0 active · 0 dead', '0 dead', 'green', 'you'],
    ]);
  });

  it('turns the backlog red once jobs are dead-lettered, amber once it goes stale', () => {
    const dead = deriveServiceLevels(healthy, { due: 4, deadLettered: 2, oldestDueHours: 1 }).at(-1);
    expect(dead).toMatchObject({ value: '4 active · 2 dead', level: 'red' });
    const stale = deriveServiceLevels(healthy, { due: 4, deadLettered: 0, oldestDueHours: 30 }).at(-1);
    expect(stale).toMatchObject({ level: 'amber' });
  });
});

describe('service level detail labels', () => {
  const failure = {
    feature: 'account',
    operation: 'save-preferences',
    outcome: 'unexpected',
    code: 'unexpected',
    errorClass: '23502' as string | null,
    count: 22,
    lastSeen: new Date('2026-09-20T18:04:00Z'),
  };

  it('names the operation and only the parts of the result that add something', () => {
    expect(operationLabel(failure)).toBe('account · save-preferences');
    expect(failureResultLabel(failure)).toBe('unexpected · 23502');
    expect(failureResultLabel({ ...failure, outcome: 'dependency_unavailable', code: 'projection_unavailable', errorClass: null }))
      .toBe('dependency_unavailable · projection_unavailable');
    expect(dayLabel(failure.lastSeen)).toBe('2026-09-20');
  });

  it('says how often a slow operation ran and where its time went', () => {
    const slow = { feature: 'planner', operation: 'read-owned-assets', p95Ms: 2000, count: 1, slowestDependency: null };
    expect(slowOperationNote(slow)).toBe('1 run');
    expect(slowOperationNote({ ...slow, count: 1200, slowestDependency: 'esi' })).toBe('1,200 runs · mostly esi');
  });
});
