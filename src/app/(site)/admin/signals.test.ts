import { describe, expect, it } from 'vitest';
import type { EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import {
  deriveAttention,
  deriveBudgetStatus,
  deriveCronStatuses,
  deriveSliSignals,
  deriveStatusGroups,
  mapLoaded,
  sliLevel,
  summarizeQueue,
  type AdminSignals,
  type CronSignals,
} from './signals';
import { SECTION_LOAD_FAILED } from './load-section';

const NOW = new Date('2026-09-26T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const healthyCrons: CronSignals = {
  lastRuns: [
    { action: 'cron_prices', timestamp: hoursAgo(3), outcome: 'refreshed' },
    { action: 'cron_sde', timestamp: hoursAgo(5), outcome: 'up-to-date' },
    { action: 'cron_housekeeping', timestamp: hoursAgo(4), outcome: 'cleaned' },
  ],
  priceOutcomes: [{ outcome: 'refreshed', count: 30, avgDurationMs: 900 }],
  sdeOutcomes: [{ outcome: 'up-to-date', count: 30, avgDurationMs: 400 }],
  gscOutcomes: [],
  housekeepingOutcomes: [{ outcome: 'cleaned', count: 30, avgDurationMs: 2000 }],
  gscConfigured: false,
  gscLastSyncedAt: null,
};

function signals(overrides: Partial<AdminSignals> = {}): AdminSignals {
  return {
    now: NOW,
    crons: healthyCrons,
    budget: { effectiveRemaining: 87, selfCount: 2, echo: 90, source: 'shared' },
    fallback: { esi: 100, fallback: 0, perDay: [] },
    budgetExhaustions: 0,
    sli: { readSuccess: 0.999, mutationSuccess: 1, latencyP95: 420, esiSuccess: 0.99 },
    queue: [],
    statics: null,
    releases: [
      { date: '2026-09-20', label: 'v4.1.2' },
      { date: '2026-09-24', label: 'v4.1.3' },
    ],
    ...overrides,
  };
}

function stat(status: EsiRefreshQueueStat['status'], count: number, ageHours: number): EsiRefreshQueueStat {
  return { status, count, oldestCreatedAt: hoursAgo(ageHours) };
}

describe('deriveSliSignals', () => {
  const outcome = (operation: string, outcome: string, count: number, esi = false) => ({
    operation, outcome, esi, feature: null, code: null, errorClass: null, day: null, count, lastSeen: NOW,
  });

  it('derives every headline from the two capability reads', () => {
    const outcomes = [
      outcome('read-owned-assets', 'succeeded', 3, true),
      outcome('read-owned-assets', 'rate_limited', 1, true),
      outcome('save-preferences', 'succeeded', 1),
      outcome('save-preferences', 'validation', 5),
    ];
    expect(deriveSliSignals(outcomes, { p95: 420, slowest: [] })).toEqual({
      readSuccess: 0.75,
      mutationSuccess: 1,
      latencyP95: 420,
      esiSuccess: 0.75,
    });
  });

  it('marks only the lines whose read failed', () => {
    expect(deriveSliSignals(SECTION_LOAD_FAILED, { p95: null, slowest: [] })).toEqual({
      readSuccess: SECTION_LOAD_FAILED,
      mutationSuccess: SECTION_LOAD_FAILED,
      latencyP95: null,
      esiSuccess: SECTION_LOAD_FAILED,
    });
    expect(deriveSliSignals([], SECTION_LOAD_FAILED)).toEqual({
      readSuccess: null,
      mutationSuccess: null,
      latencyP95: SECTION_LOAD_FAILED,
      esiSuccess: null,
    });
    expect(mapLoaded(2, (value) => value * 2)).toBe(4);
  });
});

describe('sliLevel', () => {
  it('grades success rates against warn and fail lines', () => {
    expect(sliLevel('readSuccess', 0.995)).toBe('green');
    expect(sliLevel('readSuccess', 0.97)).toBe('amber');
    expect(sliLevel('readSuccess', 0.9)).toBe('red');
    expect(sliLevel('esiSuccess', 0.9)).toBe('amber');
  });

  it('treats latency as a ceiling', () => {
    expect(sliLevel('latencyP95', 800)).toBe('green');
    expect(sliLevel('latencyP95', 2000)).toBe('amber');
    expect(sliLevel('latencyP95', 4000)).toBe('red');
  });

  it('is neutral without data', () => {
    expect(sliLevel('mutationSuccess', null)).toBe('neutral');
    expect(sliLevel('mutationSuccess', Number.NaN)).toBe('neutral');
  });
});

describe('deriveBudgetStatus', () => {
  it('fails closed when the scoreboard is unavailable', () => {
    expect(deriveBudgetStatus(null)).toMatchObject({ level: 'red', value: 'unavailable' });
  });

  it('flags a budget below the dispatch floor', () => {
    expect(deriveBudgetStatus({ effectiveRemaining: 5, selfCount: 0, echo: 5, source: 'shared' }))
      .toMatchObject({ level: 'red', value: '5 left' });
  });

  it('is green above the floor', () => {
    expect(deriveBudgetStatus({ effectiveRemaining: 87, selfCount: 0, echo: null, source: 'shared' }))
      .toMatchObject({ level: 'green', value: '87 left' });
  });
});

describe('summarizeQueue', () => {
  it('counts live and dead-lettered jobs and the oldest live job', () => {
    const summary = summarizeQueue(
      [stat('queued', 3, 2), stat('failed_retryable', 1, 8), stat('dead_lettered', 2, 30), stat('succeeded', 40, 50)],
      NOW,
    );
    expect(summary).toEqual({ due: 4, deadLettered: 2, oldestDueHours: 8 });
  });

  it('reports no oldest job for an idle queue', () => {
    expect(summarizeQueue([stat('succeeded', 4, 1)], NOW)).toEqual({
      due: 0,
      deadLettered: 0,
      oldestDueHours: null,
    });
  });
});

describe('deriveCronStatuses', () => {
  it('derives each scheduled task from its latest run', () => {
    const statuses = deriveCronStatuses(healthyCrons, NOW);
    expect(statuses.price.level).toBe('green');
    expect(statuses.sde.level).toBe('green');
    expect(statuses.gsc.level).toBe('neutral');
    expect(statuses.housekeeping.level).toBe('green');
    expect(deriveStatusGroups(signals())[2]!.lines[0]).toMatchObject({
      value: 'healthy',
      note: 'last run 3h ago',
    });
  });

  it('marks housekeeping red when its latest run was partial', () => {
    const crons: CronSignals = {
      ...healthyCrons,
      lastRuns: [{ action: 'cron_housekeeping', timestamp: hoursAgo(2), outcome: 'partial' }],
    };
    expect(deriveCronStatuses(crons, NOW).housekeeping.level).toBe('red');
  });

  it('marks a cron that never ran as red', () => {
    const crons = { ...healthyCrons, lastRuns: [] };
    expect(deriveCronStatuses(crons, NOW).price.level).toBe('red');
    expect(deriveStatusGroups(signals({ crons }))[2]!.lines[0]).toMatchObject({
      value: 'never ran',
      note: '',
    });
  });
});

describe('deriveStatusGroups', () => {
  it('reports a healthy budget and an empty queue', () => {
    const groups = deriveStatusGroups(signals());
    expect(groups[1]!.lines[0]).toMatchObject({ label: 'Error budget', value: '87 left', level: 'green' });
    expect(groups[2]!.lines[4]).toMatchObject({ value: '0 active · 0 dead', level: 'green' });
  });

  it('shows the queue age in minutes, hours, and days, amber once stale', () => {
    const hours = deriveStatusGroups(signals({ queue: [stat('queued', 2, 30)] }));
    expect(hours[2]!.lines[4]).toMatchObject({ level: 'amber', note: 'oldest job 30h' });
    const minutes = deriveStatusGroups(signals({ queue: [stat('queued', 1, 0.5)] }));
    expect(minutes[2]!.lines[4]!.note).toBe('oldest job 30m');
    const days = deriveStatusGroups(signals({ queue: [stat('queued', 1, 72)] }));
    expect(days[2]!.lines[4]!.note).toBe('oldest job 3d');
  });
});

describe('deriveAttention', () => {
  const attention = (s: AdminSignals) => deriveAttention(s, deriveStatusGroups(s));

  it('is empty when every system is healthy', () => {
    expect(attention(signals())).toEqual([]);
  });

  it('asks for a statics review with a link to the review page', () => {
    const items = attention(signals({ statics: { feedVersion: '42', totalDifferences: 1234 } }));
    expect(items).toEqual([
      expect.objectContaining({
        id: 'statics',
        level: 'amber',
        action: expect.objectContaining({ href: '/admin/statics' }),
      }),
    ]);
    expect(items[0]!.detail).toContain('1,234');
  });

  it('sends dead letters and a stale backlog to the queue', () => {
    const items = attention(signals({ queue: [stat('dead_lettered', 1, 2), stat('queued', 3, 12)] }));
    expect(items.map((i) => [i.id, i.level, i.action.href])).toEqual([
      ['dead-letters', 'red', '/admin/queue'],
      ['queue-backlog', 'amber', '/admin/queue'],
    ]);
  });

  it('routes each unhealthy status line to its page, red first', () => {
    const items = attention(
      signals({
        budget: null,
        budgetExhaustions: 2,
        fallback: { esi: 90, fallback: 10, perDay: [] },
        sli: { readSuccess: 0.97, mutationSuccess: 1, latencyP95: 420, esiSuccess: 0.99 },
        crons: { ...healthyCrons, lastRuns: healthyCrons.lastRuns.slice(1) },
      }),
    );
    expect(items.map((i) => [i.id, i.level, i.action.href])).toEqual([
      ['budget', 'red', '/admin/esi'],
      ['cron-prices', 'red', '/admin/health#scheduled'],
      ['readSuccess', 'amber', '/admin/health'],
    ]);
  });

  it('keeps informational amber off the list', () => {
    const recovered = signals({
      crons: {
        ...healthyCrons,
        priceOutcomes: [
          { outcome: 'refreshed', count: 29, avgDurationMs: 900 },
          { outcome: 'failed', count: 1, avgDurationMs: 900 },
        ],
      },
      fallback: { esi: 95, fallback: 5, perDay: [] },
      queue: [stat('deferred_for_budget', 2, 1)],
    });
    const lines = deriveStatusGroups(recovered).flatMap((group) => group.lines);
    expect(lines.filter((line) => line.level === 'amber').map((line) => line.id)).toEqual([
      'price-source',
      'held-for-budget',
      'cron-prices',
    ]);
    expect(attention(recovered)).toEqual([]);
  });

  it('raises a majority price-source fallback', () => {
    const items = attention(signals({ fallback: { esi: 20, fallback: 80, perDay: [] } }));
    expect(items.map((i) => [i.id, i.level])).toEqual([['price-source', 'red']]);
  });
});

describe('release and budget-hold lines', () => {
  const line = (s: AdminSignals, id: string) =>
    deriveStatusGroups(s).flatMap((group) => group.lines).find((l) => l.id === id)!;

  it('shows the newest changelog release and its age', () => {
    expect(line(signals(), 'release')).toMatchObject({
      value: 'v4.1.3',
      note: '2026-09-24 · 2d ago',
      level: 'neutral',
    });
    expect(line(signals({ releases: [{ date: '2026-09-26', label: 'v5' }] }), 'release').note).toBe(
      '2026-09-26 · today',
    );
  });

  it('handles an empty changelog', () => {
    expect(line(signals({ releases: [] }), 'release')).toMatchObject({ value: 'none' });
  });

  it('counts refresh jobs held for budget', () => {
    expect(line(signals(), 'held-for-budget')).toMatchObject({ value: '0 jobs', level: 'green' });
    expect(line(signals({ queue: [stat('deferred_for_budget', 1, 1)] }), 'held-for-budget')).toMatchObject({
      value: '1 job',
      level: 'amber',
    });
  });

  it('keeps the price-source sentence in the note, not the value column', () => {
    expect(line(signals(), 'price-source')).toMatchObject({
      value: 'healthy',
      note: 'ESI served every priced item this period',
      level: 'green',
    });
    expect(line(signals({ fallback: { esi: 0, fallback: 0, perDay: [] } }), 'price-source')).toMatchObject({
      value: 'idle',
      note: 'no price refreshes this period',
      level: 'neutral',
    });
  });
});

describe('a source that failed to load', () => {
  const failed = signals({ crons: SECTION_LOAD_FAILED, queue: SECTION_LOAD_FAILED });
  const byId = new Map(deriveStatusGroups(failed).flatMap((group) => group.lines.map((l) => [l.id, l])));

  it('marks only its own lines unavailable', () => {
    for (const id of ['cron-prices', 'cron-sde', 'cron-gsc', 'cron-housekeeping', 'queue', 'held-for-budget']) {
      expect(byId.get(id)).toMatchObject({ value: 'unavailable', note: '', level: 'neutral' });
    }
    expect(byId.get('readSuccess')).toMatchObject({ value: '99.9%', level: 'green' });
    expect(byId.get('budget')).toMatchObject({ value: '87 left', level: 'green' });
  });

  it('raises an attention item per failed source, linked to its page', () => {
    const items = deriveAttention(failed, deriveStatusGroups(failed));
    expect(items.map((i) => [i.id, i.level, i.action.href])).toEqual([
      ['unavailable:/admin/health#scheduled', 'amber', '/admin/health#scheduled'],
      ['unavailable:/admin/queue', 'amber', '/admin/queue'],
    ]);
  });

  it('sends a failed statics read to the statics page', () => {
    const items = deriveAttention(signals({ statics: SECTION_LOAD_FAILED }), deriveStatusGroups(signals()));
    expect(items.map((i) => i.action.href)).toEqual(['/admin/statics']);
  });

  it('names a source once when both of its reads fail', () => {
    const items = deriveAttention(
      signals({ fallback: SECTION_LOAD_FAILED, budgetExhaustions: SECTION_LOAD_FAILED }),
      deriveStatusGroups(signals()),
    );
    expect(items.map((i) => i.action.href)).toEqual(['/admin/esi']);
  });
});


describe('independent service readings', () => {
  it('keeps successful readings when latency is unavailable', () => {
    const groups = deriveStatusGroups(signals({ sli: {
      readSuccess: 1, mutationSuccess: 1, latencyP95: SECTION_LOAD_FAILED, esiSuccess: 0.99,
    } }));
    const lines = groups.flatMap((group) => group.lines);
    expect(lines.find((line) => line.id === 'latencyP95')?.value).toBe('unavailable');
    expect(lines.find((line) => line.id === 'readSuccess')?.value).toBe('100.0%');
    expect(lines.find((line) => line.id === 'esiSuccess')?.value).toBe('99.0%');
  });
});
