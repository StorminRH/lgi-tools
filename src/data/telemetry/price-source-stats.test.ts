import { describe, expect, it } from 'vitest';
import { priceSourceDegradation } from './price-source-stats';

describe('priceSourceDegradation', () => {
  it('ranks named callers and counts budget exhaustions from every caller', () => {
    expect(
      priceSourceDegradation([
        { caller: 'on-demand', count: 3, budgetExhausted: 1 },
        { caller: null, count: 9, budgetExhausted: 4 },
        { caller: 'cron', count: '5' as unknown as number, budgetExhausted: '2' as unknown as number },
        { caller: 'backfill', count: 3, budgetExhausted: 0 },
      ]),
    ).toEqual({
      byCaller: [
        { caller: 'cron', count: 5 },
        { caller: 'backfill', count: 3 },
        { caller: 'on-demand', count: 3 },
      ],
      budgetExhaustions: 7,
    });
  });

  it('reports nothing for a range with no degraded reads', () => {
    expect(priceSourceDegradation([])).toEqual({ byCaller: [], budgetExhaustions: 0 });
  });
});
