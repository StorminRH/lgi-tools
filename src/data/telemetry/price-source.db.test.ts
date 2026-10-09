import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { getPriceSourceDegradation } from './queries';
import { usageLogs } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_telemetry_price_source',
  tables: ['usage_logs'],
  steerDbProxy: true,
});

const RANGE = { from: new Date('2034-02-01T06:00:00Z'), to: new Date('2034-02-08T06:00:00Z') };
const at = (hours: number) => new Date(RANGE.from.getTime() + hours * 3_600_000);

// The two queries the combined read replaced, kept as the reference it must agree with.
const WHERE = `"timestamp" >= $1::timestamptz and "timestamp" < $2::timestamptz and action = 'price_source_degraded'`;
const ORACLE = {
  byCaller: `
    select metadata ->> 'caller' as caller, count(*)::int as count from usage_logs
    where ${WHERE} and metadata ->> 'caller' is not null group by 1 order by count(*) desc, 1`,
  budgetExhaustions: `
    select count(*)::int as n from usage_logs where ${WHERE} and metadata ->> 'budgetExhausted' = 'true'`,
};

function oracle<T>(query: string): Promise<T[]> {
  return harness.sql.unsafe(query, [RANGE.from.toISOString(), RANGE.to.toISOString()]) as unknown as Promise<T[]>;
}

const CALLERS = ['on-demand', 'cron', 'backfill', null, 'cron', 'on-demand', 'cron', 'planner'];
const EXHAUSTED = [true, false, 'true', undefined, true, null, false];

describe.skipIf(!harness.reachable)('price-source degradation agrees with the queries it replaced', () => {
  beforeAll(async () => {
    await harness.db.insert(usageLogs).values([
      ...Array.from({ length: 40 }, (_, i) => {
        const caller = CALLERS[i % CALLERS.length];
        const exhausted = EXHAUSTED[(i * 3) % EXHAUSTED.length];
        return {
          action: 'price_source_degraded',
          timestamp: at(i * 4),
          metadata: {
            ...(caller === null ? {} : { caller }),
            ...(exhausted === undefined ? {} : { budgetExhausted: exhausted }),
          },
        };
      }),
      { action: 'price_source_degraded', timestamp: RANGE.to, metadata: { caller: 'late', budgetExhausted: true } },
      { action: 'price_source_degraded', timestamp: at(-1), metadata: { caller: 'early', budgetExhausted: true } },
      { action: 'market_history_refresh', timestamp: at(2), metadata: { caller: 'cron', budgetExhausted: true } },
    ]);
  });

  it('matches the callers and the budget exhaustions, including rows without a caller', async () => {
    const degradation = await getPriceSourceDegradation(RANGE);
    expect(degradation.byCaller).toEqual(await oracle(ORACLE.byCaller));
    const [exhausted] = await oracle<{ n: number }>(ORACLE.budgetExhaustions);
    expect(degradation.budgetExhaustions).toBe(exhausted!.n);
    expect(degradation.byCaller.length).toBeGreaterThan(2);
    expect(degradation.budgetExhaustions).toBeGreaterThan(degradation.byCaller.length);
  });
});
