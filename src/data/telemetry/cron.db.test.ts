import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { CRON_ACTIONS, fallbackRate, refreshVolume } from './cron-stats';
import { getCronOutcomes, getLastCronRuns, getPriceRefreshDays } from './queries';
import { usageLogs } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_telemetry_cron',
  tables: ['usage_logs'],
  steerDbProxy: true,
});

const RANGE = { from: new Date('2033-05-10T18:00:00Z'), to: new Date('2033-05-17T18:00:00Z') };
const HOUR = 3_600_000;
const at = (hours: number) => new Date(RANGE.from.getTime() + hours * HOUR);

// The per-figure queries the combined reads replaced, kept as the reference
// they must agree with. Days are UTC, as the combined read buckets them.
const WHERE = `"timestamp" >= $1::timestamptz and "timestamp" < $2::timestamptz`;
const REFRESHED = `${WHERE} and action = 'cron_prices' and metadata ->> 'outcome' = 'refreshed'`;
const sum = (key: string) => `coalesce(sum(nullif(metadata ->> '${key}', 'null')::int), 0)::int`;
const ORACLE = {
  outcomes: `
    select metadata ->> 'outcome' as outcome, count(*)::int as count,
      coalesce(avg(nullif(metadata ->> 'durationMs', 'null')::double precision), 0) as "avgDurationMs"
    from usage_logs where ${WHERE} and action = $3 and metadata ->> 'outcome' is not null
    group by 1 order by count(*) desc, 1`,
  lastRuns: `
    select distinct on (action) action, "timestamp", metadata ->> 'outcome' as outcome
    from usage_logs where action = any($1::text[]) order by action, "timestamp" desc`,
  fallbackTotals: `select ${sum('esiCount')} as esi, ${sum('fuzzworkFallbackCount')} as fallback from usage_logs where ${REFRESHED}`,
  perDay: `
    select (("timestamp" at time zone 'UTC')::date)::text as day,
      ${sum('esiCount')} as esi, ${sum('fuzzworkFallbackCount')} as fallback,
      ${sum('fetched')} as fetched, ${sum('written')} as written
    from usage_logs where ${REFRESHED} group by 1 order by 1`,
};

function oracle<T>(query: string, ...params: unknown[]): Promise<T[]> {
  return harness.sql.unsafe(query, params as never[]) as unknown as Promise<T[]>;
}

const OUTCOMES: Record<string, (string | null)[]> = {
  cron_prices: ['refreshed', 'refreshed', 'skipped', 'refreshed', 'failed', null, 'refreshed', 'skipped'],
  cron_sde: ['up-to-date', 'busy', 'up-to-date', 'reingested', 'up-to-date'],
  cron_gsc: ['synced', 'failed', 'synced'],
  cron_housekeeping: ['cleaned'],
  cron_wh_statics: ['checked', 'checked'],
};

/** Runs of each cron across the range and outside it, with varied outcomes, durations and counts. */
function cronRuns() {
  return Object.entries(OUTCOMES).flatMap(([action, outcomes], a) =>
    Array.from({ length: outcomes.length * 3 }, (_, i) => {
      const outcome = outcomes[i % outcomes.length]!;
      const metadata: Record<string, unknown> = {
        ...(outcome === null ? {} : { outcome }),
        ...(i % 4 === 0 ? {} : { durationMs: i % 5 === 0 ? null : 100 * (a + 1) + i * 7.3 }),
      };
      if (action === 'cron_prices') {
        Object.assign(metadata, {
          esiCount: 90 + i,
          ...(i % 3 === 0 ? {} : { fuzzworkFallbackCount: i }),
          fetched: 1000 + i * 11,
          ...(i % 6 === 1 ? { written: null } : { written: 900 + i * 7 }),
        });
      }
      return { action, timestamp: at(i * 7 + a * 0.5 - 6), metadata };
    }),
  );
}

describe.skipIf(!harness.reachable)('cron reads agree with the per-figure queries they replaced', () => {
  beforeAll(async () => {
    await harness.db.insert(usageLogs).values([
      ...cronRuns(),
      { action: 'cron_prices', timestamp: at(500), metadata: { outcome: 'refreshed', esiCount: 1, fetched: 1 } },
      { action: 'cron_sde', timestamp: at(-500), metadata: { outcome: 'busy' } },
      { action: 'cron_prices', timestamp: RANGE.to, metadata: { outcome: 'refreshed', esiCount: 5 } },
      { action: 'page_view', timestamp: at(3), metadata: { outcome: 'refreshed', esiCount: 5 } },
    ]);
  });

  it('matches each cron’s outcomes', async () => {
    const outcomes = await getCronOutcomes(RANGE);
    for (const action of CRON_ACTIONS) {
      const expected = await oracle<{ outcome: string; count: number; avgDurationMs: number }>(
        ORACLE.outcomes,
        RANGE.from.toISOString(),
        RANGE.to.toISOString(),
        action,
      );
      expect(outcomes[action]).toEqual(
        expected.map((row) => ({ ...row, avgDurationMs: Math.round(Number(row.avgDurationMs)) })),
      );
      expect(outcomes[action].length).toBeGreaterThan(0);
    }
  });

  it('matches the latest run of each cron, at any time', async () => {
    const expected = await oracle<{ action: string; timestamp: string; outcome: string | null }>(
      ORACLE.lastRuns,
      [...CRON_ACTIONS],
    );
    const runs = await getLastCronRuns();
    expect([...runs].sort((a, b) => a.action.localeCompare(b.action))).toEqual(
      expected.map((row) => ({ ...row, timestamp: new Date(row.timestamp) })),
    );
    expect(runs.find((run) => run.action === 'cron_prices')?.timestamp).toEqual(at(500));
    expect(runs).toHaveLength(4);
  });

  it('matches the fallback rate and refresh volume', async () => {
    const days = await getPriceRefreshDays(RANGE);
    const range = [RANGE.from.toISOString(), RANGE.to.toISOString()];
    const [totals] = await oracle<{ esi: number; fallback: number }>(ORACLE.fallbackTotals, ...range);
    const perDay = await oracle<{ day: string; esi: number; fallback: number; fetched: number; written: number }>(
      ORACLE.perDay,
      ...range,
    );
    expect(days.length).toBeGreaterThan(2);
    expect(fallbackRate(days)).toEqual({
      ...totals,
      perDay: perDay.map(({ day, esi, fallback }) => ({ day, esi, fallback })),
    });
    expect(refreshVolume(days)).toEqual(perDay.map(({ day, fetched, written }) => ({ day, fetched, written })));
  });
});
