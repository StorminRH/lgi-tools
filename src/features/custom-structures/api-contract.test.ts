import { describe, expect, it } from 'vitest';
import {
  createCustomStructureRequestSchema,
  setCustomStructureTaxRequestSchema,
} from './api-contract';

// The facility-tax entry bound (0–10%, decimals, null = clear). The cap itself
// is pinned in fees.test.ts; these pin the wire validation built from it.
describe('setCustomStructureTaxRequestSchema', () => {
  it('accepts the full entry range: 0, decimals, the cap, and null (clear)', () => {
    for (const taxPct of [0, 0.25, 1.5, 10, null]) {
      expect(setCustomStructureTaxRequestSchema.safeParse({ id: 'x', taxPct }).success).toBe(true);
    }
  });

  it('rejects out-of-cap and negative rates', () => {
    for (const taxPct of [10.01, 12, -1]) {
      expect(setCustomStructureTaxRequestSchema.safeParse({ id: 'x', taxPct }).success).toBe(false);
    }
  });
});

describe('createCustomStructureRequestSchema taxPct', () => {
  it('defaults an omitted tax to null (never-entered, NOT 0)', () => {
    const parsed = createCustomStructureRequestSchema.parse({
      name: 'Fort Test',
      structureTypeId: 35825,
      rigTypeIds: [],
    });
    expect(parsed.taxPct).toBeNull();
  });

  it('bounds an entered create-time tax by the same cap', () => {
    const base = { name: 'Fort Test', structureTypeId: 35825, rigTypeIds: [] };
    expect(createCustomStructureRequestSchema.safeParse({ ...base, taxPct: 2.5 }).success).toBe(true);
    expect(createCustomStructureRequestSchema.safeParse({ ...base, taxPct: 11 }).success).toBe(false);
  });
});
