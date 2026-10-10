import { describe, expect, it } from 'vitest';
import { deriveBudgetStatus } from '../signals';
import { deriveBudgetCard, derivePressureLines } from './esi-view';

const quiet = {
  esiSuccess: 0.995,
  budgetExhaustions: 0,
  fallback: { esi: 200, fallback: 0, perDay: [] },
  degradation: [],
  queue: [],
};

describe('deriveBudgetCard', () => {
  it('fills the gauge from the effective remaining budget', () => {
    expect(
      deriveBudgetCard({ effectiveRemaining: 87, selfCount: 3, echo: 90, source: 'shared' }),
    ).toMatchObject({ level: 'green', note: 'floor 20 · live', remaining: '87', ceiling: 100, pct: 87 });
  });

  it('empties the gauge and lists no figures when the scoreboard is down', () => {
    expect(deriveBudgetCard(null)).toMatchObject({
      level: 'red',
      note: 'scoreboard unavailable · dispatch paused',
      remaining: '—',
      pct: 0,
      figures: [],
    });
  });

  it('clamps an out-of-range snapshot', () => {
    expect(
      deriveBudgetCard({ effectiveRemaining: -4, selfCount: 104, echo: null, source: 'shared' }).pct,
    ).toBe(0);
  });

  it('takes its level and note from the overview’s budget reading', () => {
    for (const snapshot of [
      null,
      { effectiveRemaining: 19, selfCount: 81, echo: 19, source: 'shared' as const },
      { effectiveRemaining: 20, selfCount: 80, echo: null, source: 'shared' as const },
    ]) {
      const { level, note } = deriveBudgetStatus(snapshot);
      expect(deriveBudgetCard(snapshot)).toMatchObject({ level, note });
    }
  });

  it('lists the readings behind the gauge, not the remaining figure again', () => {
    const shared = deriveBudgetCard({ effectiveRemaining: 1_250, selfCount: 1_204, echo: 90, source: 'shared' });
    expect(shared.figures).toEqual([
      { label: 'Observed HTTP errors', value: '1,204', note: '4xx/5xx · last 2 min' },
      { label: 'Lowest recent CCP allowance', value: '90', note: 'CCP response header' },
      { label: 'Scoreboard source', value: 'shared', note: 'Upstash Redis' },
    ]);
    const local = deriveBudgetCard({ effectiveRemaining: 19, selfCount: 12, echo: null, source: 'process-local' });
    expect(local.level).toBe('red');
    expect(local.figures.map((row) => [row.value, row.note])).toEqual([
      ['12', '4xx/5xx · last 2 min'],
      ['—', 'not observed'],
      ['process-local', 'development fallback'],
    ]);
  });
});

describe('derivePressureLines', () => {
  it('is all green on a quiet period', () => {
    const lines = derivePressureLines(quiet);
    expect(lines.map((line) => line.level)).toEqual(['green', 'green', 'green', 'green', 'green']);
    expect(lines[2]).toMatchObject({ value: '0%', note: '0 of 200 priced items' });
    // Counts with nothing to add carry no note at all, not an empty one.
    expect(lines.filter((line) => line.note === undefined).map((line) => line.id)).toEqual([
      'exhaustions',
      'degradation',
      'deferred',
    ]);
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
    expect(lines[0]!.note).toBe('— operations · target ≥ 95%');
  });

  it('reports no data before any price refresh', () => {
    const lines = derivePressureLines({ ...quiet, esiSuccess: null, fallback: { esi: 0, fallback: 0, perDay: [] } });
    expect(lines[0]).toMatchObject({ value: 'no data', level: 'neutral' });
    expect(lines[2]).toMatchObject({ value: 'no data', level: 'neutral' });
  });
});
