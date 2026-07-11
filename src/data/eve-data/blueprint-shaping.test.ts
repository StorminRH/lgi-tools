import { describe, expect, it } from 'vitest';
import {
  collectSearchPending,
  collectTrackedTypeIds,
  pickBlueprintOutput,
  pickProducingActivityId,
  resolveSearchRows,
  type PendingSearchRow,
} from './blueprint-shaping';
import type { BlueprintActivities } from './tree-resolver';

// Manufacturing activityId = 1, reaction = 11 (ACTIVITY_NAME_TO_ID).
const mfg = (products: { typeID: number; quantity: number }[]): BlueprintActivities => ({
  manufacturing: { products },
});
const reaction = (products: { typeID: number; quantity: number }[]): BlueprintActivities => ({
  reaction: { products },
});

describe('pickBlueprintOutput', () => {
  it('returns the first manufacturing product with activityId 1', () => {
    expect(pickBlueprintOutput(mfg([{ typeID: 587, quantity: 1 }]))).toEqual({
      productTypeId: 587,
      quantity: 1,
      activityId: 1,
    });
  });

  it('prefers manufacturing over reaction when both are present', () => {
    const activities: BlueprintActivities = {
      manufacturing: { products: [{ typeID: 587, quantity: 1 }] },
      reaction: { products: [{ typeID: 16671, quantity: 200 }] },
    };
    expect(pickBlueprintOutput(activities)).toEqual({
      productTypeId: 587,
      quantity: 1,
      activityId: 1,
    });
  });

  it('falls back to reaction (activityId 11) when there is no manufacturing product', () => {
    expect(pickBlueprintOutput(reaction([{ typeID: 16671, quantity: 200 }]))).toEqual({
      productTypeId: 16671,
      quantity: 200,
      activityId: 11,
    });
  });

  it('returns null when neither activity produces anything', () => {
    expect(pickBlueprintOutput({})).toBeNull();
    expect(pickBlueprintOutput({ manufacturing: { products: [] } })).toBeNull();
  });
});

describe('pickProducingActivityId', () => {
  it('returns 1 for a manufacturing product', () => {
    expect(pickProducingActivityId(mfg([{ typeID: 587, quantity: 1 }]))).toBe(1);
  });

  it('returns 11 for a reaction-only product', () => {
    expect(pickProducingActivityId(reaction([{ typeID: 16671, quantity: 200 }]))).toBe(11);
  });

  it('prefers manufacturing (1) when both are present', () => {
    expect(
      pickProducingActivityId({
        manufacturing: { products: [{ typeID: 587, quantity: 1 }] },
        reaction: { products: [{ typeID: 16671, quantity: 200 }] },
      }),
    ).toBe(1);
  });

  it('returns null when neither activity yields a product', () => {
    expect(pickProducingActivityId({})).toBeNull();
    expect(pickProducingActivityId({ manufacturing: { products: [] } })).toBeNull();
  });
});

describe('collectSearchPending', () => {
  it('flattens every manufacturing/reaction product into pending rows and collects product ids', () => {
    const rows = [
      { blueprintTypeId: 681, activities: mfg([{ typeID: 587, quantity: 1 }]) },
      {
        blueprintTypeId: 46186,
        activities: reaction([
          { typeID: 16671, quantity: 200 },
          { typeID: 16672, quantity: 100 },
        ]),
      },
    ];
    const { pending, productIds } = collectSearchPending(rows);
    expect(pending).toEqual([
      { blueprintTypeId: 681, activityId: 1, productTypeId: 587 },
      { blueprintTypeId: 46186, activityId: 11, productTypeId: 16671 },
      { blueprintTypeId: 46186, activityId: 11, productTypeId: 16672 },
    ]);
    expect([...productIds].sort((a, b) => a - b)).toEqual([587, 16671, 16672]);
  });

  it('treats null/absent activities as empty', () => {
    const { pending, productIds } = collectSearchPending([
      { blueprintTypeId: 1, activities: null },
      { blueprintTypeId: 2, activities: {} },
    ]);
    expect(pending).toEqual([]);
    expect(productIds.size).toBe(0);
  });
});

describe('resolveSearchRows', () => {
  const pending: PendingSearchRow[] = [
    { blueprintTypeId: 681, activityId: 1, productTypeId: 587 },
    { blueprintTypeId: 999, activityId: 1, productTypeId: 12345 },
  ];

  it('joins published names and drops products with no name (unpublished)', () => {
    const rows = resolveSearchRows(pending, [{ id: 587, name: 'Rifter' }]);
    expect(rows).toEqual([
      { blueprintTypeId: 681, activityId: 1, productTypeId: 587, name: 'Rifter' },
    ]);
  });

  it('keeps all rows when every product name resolves', () => {
    const rows = resolveSearchRows(pending, [
      { id: 587, name: 'Rifter' },
      { id: 12345, name: 'Widget' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      blueprintTypeId: 999,
      activityId: 1,
      productTypeId: 12345,
      name: 'Widget',
    });
  });
});

describe('collectTrackedTypeIds', () => {
  it('unions every material input and product output across all rows', () => {
    const rows = [
      {
        blueprintTypeId: 681,
        activities: {
          manufacturing: {
            materials: [
              { typeID: 34, quantity: 100 },
              { typeID: 35, quantity: 50 },
            ],
            products: [{ typeID: 587, quantity: 1 }],
          },
        } as BlueprintActivities,
      },
      {
        blueprintTypeId: 682,
        activities: {
          manufacturing: {
            materials: [{ typeID: 34, quantity: 200 }],
            products: [{ typeID: 588, quantity: 1 }],
          },
        } as BlueprintActivities,
      },
    ];
    expect(collectTrackedTypeIds(rows).sort((a, b) => a - b)).toEqual([34, 35, 587, 588]);
  });

  it('returns an empty array when no rows carry industry activities', () => {
    expect(collectTrackedTypeIds([{ blueprintTypeId: 1, activities: {} }])).toEqual([]);
  });
});
