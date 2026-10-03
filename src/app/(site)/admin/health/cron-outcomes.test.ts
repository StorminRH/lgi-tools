import { describe, expect, it } from 'vitest';
import { CRON_OUTCOME_RULES } from '../signals';
import { formatDurationMs, toneOutcomes } from './cron-outcomes';

const row = (outcome: string, count: number) => ({ outcome, count, avgDurationMs: 100 });

describe('toneOutcomes', () => {
  it('colours the normal result green and other healthy results blue', () => {
    const toned = toneOutcomes([row('reingested', 12), row('up-to-date', 18)], CRON_OUTCOME_RULES.sde);
    expect(toned.map((o) => [o.outcome, o.tone])).toEqual([
      ['up-to-date', 'green'],
      ['reingested', 'blue'],
    ]);
  });

  it('orders good results before neutral, degraded and failed ones', () => {
    const toned = toneOutcomes(
      [row('error', 9), row('partial', 30), row('skipped', 40), row('synced', 2)],
      CRON_OUTCOME_RULES.gsc,
    );
    expect(toned.map((o) => [o.outcome, o.tone])).toEqual([
      ['synced', 'green'],
      ['skipped', 'neutral'],
      ['partial', 'orange'],
      ['error', 'red'],
    ]);
  });
});

describe('formatDurationMs', () => {
  it('picks a unit that keeps the number short', () => {
    expect(formatDurationMs(708)).toBe('708 ms');
    expect(formatDurationMs(21_694)).toBe('21.7 s');
    expect(formatDurationMs(150_000)).toBe('2.5 min');
  });
});
