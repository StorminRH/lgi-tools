import { describe, expect, it } from 'vitest';
import {
  createCustomStructureRequestSchema,
  updateCustomStructureRequestSchema,
} from './api-contract';

const ENTERED = {
  manufacturing: { me: 3.38, te: 39.2, cost: 4 },
  reactions: { me: 0, te: 0 },
};

describe('updateCustomStructureRequestSchema', () => {
  const base = { id: 'x', name: 'Fort Test', structureTypeId: 35825, rigTypeIds: [] };

  it('accepts the full tax range: 0, decimals, the cap, and null (clear)', () => {
    for (const taxPct of [0, 0.25, 1.5, 10, null]) {
      expect(updateCustomStructureRequestSchema.safeParse({ ...base, taxPct }).success).toBe(true);
    }
  });

  it('rejects out-of-cap and negative rates', () => {
    for (const taxPct of [10.01, 12, -1]) {
      expect(updateCustomStructureRequestSchema.safeParse({ ...base, taxPct }).success).toBe(false);
    }
  });

  it('requires the row id', () => {
    const { id: _id, ...noId } = base;
    expect(updateCustomStructureRequestSchema.safeParse(noId).success).toBe(false);
  });
});

describe('createCustomStructureRequestSchema', () => {
  const base = { name: 'Fort Test', structureTypeId: 35825, rigTypeIds: [] };

  it('defaults an omitted tax and bonuses to null (never-entered, NOT 0)', () => {
    const parsed = createCustomStructureRequestSchema.parse(base);
    expect(parsed.taxPct).toBeNull();
    expect(parsed.bonuses).toBeNull();
  });

  it('bounds an entered create-time tax by the same cap', () => {
    expect(createCustomStructureRequestSchema.safeParse({ ...base, taxPct: 2.5 }).success).toBe(true);
    expect(createCustomStructureRequestSchema.safeParse({ ...base, taxPct: 11 }).success).toBe(false);
  });

  it('accepts entered bonuses on a structure without rigs', () => {
    const parsed = createCustomStructureRequestSchema.parse({ ...base, bonuses: ENTERED });
    expect(parsed.bonuses).toEqual(ENTERED);
  });

  it('rejects entered bonuses alongside rigs', () => {
    const result = createCustomStructureRequestSchema.safeParse({
      ...base,
      rigTypeIds: [37170],
      bonuses: ENTERED,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bonus outside 0–99%', () => {
    for (const me of [-1, 100]) {
      const bonuses = { ...ENTERED, manufacturing: { ...ENTERED.manufacturing, me } };
      expect(createCustomStructureRequestSchema.safeParse({ ...base, bonuses }).success).toBe(false);
    }
  });
});
