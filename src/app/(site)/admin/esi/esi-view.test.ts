import { describe, expect, it } from 'vitest';
import { deriveBudgetGauge, derivePressureLines, fallbackShare } from './esi-view';

const quiet = {
  esiSuccess: 0.995,
  budgetExhaustions: 0,
  fallback: { esi: 200, fallback: 0, perDay: [] },
  degradation: [],
  queue: [],
};

describe('deriveBudgetGauge', () => {
  it('fills the gauge from the effective remaining budget', () => {
    expect(
      deriveBudgetGauge({ effectiveRemaining: 87, selfCount: 3, echo: 90, source: 'shared' }),
    ).toMatchObject({ level: 'green', remaining: '87', ceiling: 100, pct: 87 });
  });

  it('empties the gauge when the scoreboard is down', () => {
    expect(deriveBudgetGauge(null)).toMatchObject({ level: 'red', remaining: '—', pct: 0 });
  });

  it('clamps an out-of-range snapshot', () => {
    expect(
      deriveBudgetGauge({ effectiveRemaining: -4, selfCount: 104, echo: null, source: 'shared' }).pct,
    ).toBe(0);
  });
});

describe('derivePressureLines', () => {
  it('is all green on a quiet period', () => {
    const lines = derivePressureLines(quiet);
    expect(lines.map((line) => line.level)).toEqual(['green', 'green', 'green', 'green', 'green']);
    expect(lines[2]).toMatchObject({ value: '0%', note: '0 of 200 priced items' });
  });

  it('flags budget pressure, fallback, degradation, and held jobs', () => {
    const lines = derivePressureLines({
      esiSuccess: 0.9,
      budgetExhaustions: 3,
      fallback: { esi: 40, fallback: 60, perDay: [] },
      degradation: [
        { caller: 'prices', count: 4 },
        { caller: 'history', count: 1 },
      ],
      queue: [
        { status: 'deferred_for_budget', count: 6, oldestCreatedAt: new Date() },
        { status: 'queued', count: 2, oldestCreatedAt: new Date() },
      ],
    });
    expect(lines.map((line) => [line.value, line.level])).toEqual([
      ['90.0%', 'amber'],
      ['3', 'amber'],
      ['60%', 'red'],
      ['5', 'amber'],
      ['6', 'amber'],
    ]);
    expect(lines[3]!.note).toBe('prices 4 · history 1');
  });

  it('reports no data before any price refresh', () => {
    const lines = derivePressureLines({ ...quiet, esiSuccess: null, fallback: { esi: 0, fallback: 0, perDay: [] } });
    expect(lines[0]).toMatchObject({ value: 'no data', level: 'neutral' });
    expect(lines[2]).toMatchObject({ value: 'no data', level: 'neutral' });
  });
});

describe('fallbackShare', () => {
  it('never rounds a real fallback down to zero', () => {
    expect(fallbackShare({ esi: 999, fallback: 1, perDay: [] })).toBe('<1%');
    expect(fallbackShare({ esi: 100, fallback: 0, perDay: [] })).toBe('0%');
    expect(fallbackShare({ esi: 50, fallback: 50, perDay: [] })).toBe('50%');
    expect(fallbackShare({ esi: 0, fallback: 0, perDay: [] })).toBe('no data');
  });
});
