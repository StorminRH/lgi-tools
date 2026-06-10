import { describe, expect, expectTypeOf, it } from 'vitest';
import { refreshPricesRequestSchema, wirePriceSchema } from './api-contract';
import type { PriceSource } from './types';

describe('market-prices contract', () => {
  it('pins the wire source enum to PriceSource exactly (both directions)', () => {
    // The schema carries `satisfies z.ZodType<PriceSource>` (no extra members);
    // this catches the reverse drift — a PriceSource member the wire enum lacks.
    expectTypeOf<(typeof wirePriceSchema.shape.source)['options'][number]>().toEqualTypeOf<PriceSource>();
  });

  it('accepts a bounded typeId batch', () => {
    expect(refreshPricesRequestSchema.safeParse({ typeIds: [34, 35, 36] }).success).toBe(true);
  });

  it('rejects an empty batch and non-positive ids', () => {
    expect(refreshPricesRequestSchema.safeParse({ typeIds: [] }).success).toBe(false);
    expect(refreshPricesRequestSchema.safeParse({ typeIds: [0] }).success).toBe(false);
  });
});
