import { describe, expect, it } from 'vitest';
import { SLI_IDS } from '@/data/telemetry/sli';
import { deriveServiceLevels } from './health-view';

const healthy = { readSuccess: 0.999, mutationSuccess: 1, latencyP95: 420, esiSuccess: 0.99 };
const idleQueue = { due: 0, deadLettered: 0, oldestDueHours: null };

describe('deriveServiceLevels', () => {
  it('emits one row per SLI definition in order', () => {
    const rows = deriveServiceLevels(healthy, idleQueue);
    expect(rows.map((row) => row.id)).toEqual([...SLI_IDS]);
    expect(rows.every((row) => row.level === 'green')).toBe(true);
  });

  it('formats values against their targets and names the owner', () => {
    const rows = deriveServiceLevels(
      { readSuccess: 0.97, mutationSuccess: null, latencyP95: 3200, esiSuccess: 0.9 },
      idleQueue,
    );
    expect(rows.map((row) => [row.value, row.target, row.level, row.owner])).toEqual([
      ['97.0%', '≥ 99%', 'amber', 'you'],
      ['no data', '≥ 99%', 'neutral', 'you'],
      ['3,200 ms', '≤ 1,500 ms', 'red', 'you'],
      ['90.0%', '≥ 95%', 'amber', 'CCP'],
      ['0 due · 0 dead', '0 dead', 'green', 'you'],
    ]);
  });

  it('turns the backlog red once jobs are dead-lettered', () => {
    const backlog = deriveServiceLevels(healthy, { due: 4, deadLettered: 2, oldestDueHours: 1 }).at(-1);
    expect(backlog).toMatchObject({ value: '4 due · 2 dead', level: 'red' });
  });

  it('turns a stale backlog amber, matching the overview', () => {
    const backlog = deriveServiceLevels(healthy, { due: 4, deadLettered: 0, oldestDueHours: 30 }).at(-1);
    expect(backlog).toMatchObject({ level: 'amber' });
  });
});
