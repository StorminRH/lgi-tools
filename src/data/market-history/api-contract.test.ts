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
  });

  it('rejects an empty batch, non-positive ids, and an over-cap batch', () => {
    expect(refreshHistoryRequestSchema.safeParse({ typeIds: [] }).success).toBe(false);
    expect(refreshHistoryRequestSchema.safeParse({ typeIds: [0] }).success).toBe(false);
    const overCap = Array.from({ length: ON_DEMAND_HISTORY_MAX_TYPE_IDS + 1 }, (_, i) => i + 1);
    expect(refreshHistoryRequestSchema.safeParse({ typeIds: overCap }).success).toBe(false);
  });
});
