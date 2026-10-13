import { expect, test } from 'vitest';
import {
  deriveAttention,
  deriveBudgetStatus,
  deriveCronStatuses,
  deriveSliSignals,
  deriveStatusGroups,
  mapLoaded,
  sliLevel,
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
    statics: null,
    releases: [
      { date: '2026-09-20', label: 'v4.1.2' },
      { date: '2026-09-24', label: 'v4.1.3' },
    ],
    ...overrides,
  };
}

const attention = (s: AdminSignals) => deriveAttention(s, deriveStatusGroups(s));
const line = (s: AdminSignals, id: string) =>
  deriveStatusGroups(s).flatMap((group) => group.lines).find((l) => l.id === id)!;

test('deriveSliSignals derives every headline from the two capability reads, marking only the lines whose read failed', () => {
  const outcome = (operation: string, outcome: string, count: number, esi = false) => ({
    operation, outcome, esi, feature: null, code: null, errorClass: null, day: null, count, lastSeen: NOW,
  });
  const outcomes = [
    outcome('read-owned-assets', 'succeeded', 3, true),
    outcome('read-owned-assets', 'rate_limited', 1, true),
    outcome('save-preferences', 'succeeded', 1),
    outcome('save-preferences', 'validation', 5),
  ];
  expect(deriveSliSignals({ outcomes, latency: { p95: 420, slowest: [] } })).toEqual({
    readSuccess: 0.75,
    mutationSuccess: 1,
    latencyP95: 420,
    esiSuccess: 0.75,
  });

  expect(deriveSliSignals({ outcomes: SECTION_LOAD_FAILED, latency: { p95: null, slowest: [] } })).toEqual({
    readSuccess: SECTION_LOAD_FAILED,
    mutationSuccess: SECTION_LOAD_FAILED,
    latencyP95: null,
    esiSuccess: SECTION_LOAD_FAILED,
  });
  expect(deriveSliSignals({ outcomes: [], latency: SECTION_LOAD_FAILED })).toEqual({
    readSuccess: null,
    mutationSuccess: null,
    latencyP95: SECTION_LOAD_FAILED,
    esiSuccess: null,
  });
  expect(mapLoaded(2, (value) => value * 2)).toBe(4);
});

test('sliLevel grades each signal against its own target, latency as a ceiling, and is neutral without data', () => {
  expect(sliLevel('readSuccess', 0.995)).toBe('green');
  expect(sliLevel('readSuccess', 0.97)).toBe('amber');
  expect(sliLevel('readSuccess', 0.9)).toBe('red');
  expect(sliLevel('esiSuccess', 0.9)).toBe('amber');
  expect(sliLevel('latencyP95', 800)).toBe('green');
  expect(sliLevel('latencyP95', 2000)).toBe('amber');
  expect(sliLevel('latencyP95', 4000)).toBe('red');
  expect(sliLevel('mutationSuccess', null)).toBe('neutral');
  expect(sliLevel('mutationSuccess', Number.NaN)).toBe('neutral');
});

test('deriveBudgetStatus fails closed without a scoreboard, flags a budget below the dispatch floor, and is green from the floor up', () => {
  expect(deriveBudgetStatus(null)).toEqual({
    level: 'red',
    value: 'unavailable',
    note: 'scoreboard unavailable · dispatch paused',
  });
  expect(deriveBudgetStatus({ effectiveRemaining: 5, selfCount: 0, echo: 5, source: 'shared' }))
    .toEqual({ level: 'red', value: '5 left', note: 'floor 20 · dispatch paused' });
  expect(deriveBudgetStatus({ effectiveRemaining: 20, selfCount: 0, echo: null, source: 'shared' }))
    .toEqual({ level: 'green', value: '20 left', note: 'floor 20 · live' });
  expect(deriveBudgetStatus({ effectiveRemaining: 1_087, selfCount: 0, echo: null, source: 'shared' }).value)
    .toBe('1,087 left');
});

test('deriveCronStatuses derives each scheduled task from its latest run', () => {
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

test('deriveCronStatuses marks housekeeping red when its latest run was partial', () => {
  const crons: CronSignals = {
    ...healthyCrons,
    lastRuns: [{ action: 'cron_housekeeping', timestamp: hoursAgo(2), outcome: 'partial' }],
  };
  expect(deriveCronStatuses(crons, NOW).housekeeping.level).toBe('red');
});

test('deriveStatusGroups reports a healthy budget and lists only the scheduled tasks under jobs', () => {
  const groups = deriveStatusGroups(signals());
  expect(groups[1]!.lines[0]).toMatchObject({ label: 'Error budget', value: '87 left', level: 'green' });
  expect(groups[1]!.lines.map((line) => line.id)).toEqual(['budget', 'esiSuccess', 'price-source']);
  expect(groups[2]!.lines.map((line) => line.id)).toEqual([
    'cron-prices', 'cron-sde', 'cron-gsc', 'cron-housekeeping',
  ]);
});

test('deriveAttention is empty when every system is healthy', () => {
  expect(attention(signals())).toEqual([]);
});

test('deriveAttention asks for a statics review with a link to the review page', () => {
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

test('deriveAttention routes each unhealthy status line to its page, red first', () => {
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

test('deriveAttention keeps informational amber off the list', () => {
  const recovered = signals({
    crons: {
      ...healthyCrons,
      priceOutcomes: [
        { outcome: 'refreshed', count: 29, avgDurationMs: 900 },
        { outcome: 'failed', count: 1, avgDurationMs: 900 },
      ],
    },
    fallback: { esi: 95, fallback: 5, perDay: [] },
  });
  const lines = deriveStatusGroups(recovered).flatMap((group) => group.lines);
  expect(lines.filter((line) => line.level === 'amber').map((line) => line.id)).toEqual([
    'price-source',
    'cron-prices',
  ]);
  // The recovered cron stays quiet because its status says so, not because of its wording.
  expect(lines.find((line) => line.id === 'cron-prices')).toMatchObject({
    value: 'recovered',
    note: '1 failed run this period, latest healthy 3h ago',
    quiet: true,
  });
  expect(attention(recovered)).toEqual([]);
});

test('deriveAttention raises a majority price-source fallback', () => {
  const items = attention(signals({ fallback: { esi: 20, fallback: 80, perDay: [] } }));
  expect(items.map((i) => [i.id, i.level])).toEqual([['price-source', 'red']]);
});

test('the release line shows the newest changelog release and its age, or none', () => {
  expect(line(signals(), 'release')).toMatchObject({
    value: 'v4.1.3',
    note: '2026-09-24 · 2d ago',
    level: 'neutral',
  });
  expect(line(signals({ releases: [{ date: '2026-09-26', label: 'v5' }] }), 'release').note).toBe(
    '2026-09-26 · today',
  );
  expect(line(signals({ releases: [] }), 'release')).toEqual({
    id: 'release',
    label: 'Latest release',
    value: 'none',
    level: 'neutral',
  });
});

test('a source that failed to load marks only its own lines unavailable, as does one failed latency reading', () => {
  const failed = signals({ crons: SECTION_LOAD_FAILED, statics: SECTION_LOAD_FAILED });
  const byId = new Map(deriveStatusGroups(failed).flatMap((group) => group.lines.map((l) => [l.id, l])));
  for (const id of ['cron-prices', 'cron-sde', 'cron-gsc', 'cron-housekeeping']) {
    expect(byId.get(id)).toEqual({ id, label: expect.any(String), value: 'unavailable', level: 'neutral' });
  }
  expect(byId.get('readSuccess')).toMatchObject({ value: '99.9%', level: 'green' });
  expect(byId.get('budget')).toMatchObject({ value: '87 left', level: 'green' });

  const latencyFailed = signals({ sli: {
    readSuccess: 1, mutationSuccess: 1, latencyP95: SECTION_LOAD_FAILED, esiSuccess: 0.99,
  } });
  expect(line(latencyFailed, 'latencyP95').value).toBe('unavailable');
  expect(line(latencyFailed, 'readSuccess').value).toBe('100.0%');
  expect(line(latencyFailed, 'esiSuccess').value).toBe('99.0%');
});

test('a failed source raises one attention item per page, linked to it, even when both of its reads fail', () => {
  const failed = signals({ crons: SECTION_LOAD_FAILED, statics: SECTION_LOAD_FAILED });
  expect(attention(failed).map((i) => [i.id, i.level, i.action.href])).toEqual([
    ['unavailable:/admin/health#scheduled', 'amber', '/admin/health#scheduled'],
    ['unavailable:/admin/statics', 'amber', '/admin/statics'],
  ]);

  const esiFailed = signals({ fallback: SECTION_LOAD_FAILED, budgetExhaustions: SECTION_LOAD_FAILED });
  expect(attention(esiFailed).map((i) => i.action.href)).toEqual(['/admin/esi']);
});
