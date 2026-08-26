import { describe, expect, expectTypeOf, it } from 'vitest';
import { refreshHistoryRequestSchema, wireHistoryInputsSchema } from './api-contract';
import { ON_DEMAND_HISTORY_MAX_TYPE_IDS } from './constants';
import type { MarketHistoryInputs } from './types';

describe('market-history contract', () => {
  it('pins the wire inputs shape to MarketHistoryInputs exactly', () => {
    expectTypeOf<typeof wireHistoryInputsSchema._output>().toEqualTypeOf<MarketHistoryInputs>();
  });

  it('accepts a bounded typeId batch', () => {
    expect(refreshHistoryRequestSchema.safeParse({ typeIds: [34] }).success).toBe(true);
    expect(
      wireHistoryInputsSchema.safeParse({
        typeId: 34,
        averageDailyVolume: [{ days: 30, adv: 1000 }],
        volumeCv: 0.2,
        priceVolatility: 0.1,
        daysCovered: 30,
        latestDate: '2026-07-01',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty batch, non-positive ids, and an over-cap batch', () => {
    expect(refreshHistoryRequestSchema.safeParse({ typeIds: [] }).success).toBe(false);
    expect(refreshHistoryRequestSchema.safeParse({ typeIds: [0] }).success).toBe(false);
    const overCap = Array.from({ length: ON_DEMAND_HISTORY_MAX_TYPE_IDS + 1 }, (_, i) => i + 1);
    expect(refreshHistoryRequestSchema.safeParse({ typeIds: overCap }).success).toBe(false);
  });
});
