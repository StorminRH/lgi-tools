import { describe, expect, it } from 'vitest';
import { jitaMid, type PriceBook, type TypeCategories, unitValue, valueCharacter } from './valuation';

const TRITANIUM = 34;
const TENGU = 29984;
const OCULAR = 10217;
const MEMORY_AUG = 10209;
const PLEX = 44992;
const RIFTER_BPO = 787;
const SKIN = 42000;
const SKILLBOOK = 3334;
const UNPRICED = 999_999;

const PRICES: PriceBook = new Map([
  [TRITANIUM, { jitaMid: 4, average: 3.5 }],
  [TENGU, { jitaMid: 230_000_000, average: 224_000_000 }],
  [OCULAR, { jitaMid: 90_000_000, average: 97_000_000 }],
  [MEMORY_AUG, { jitaMid: null, average: 60_000_000 }],
  [PLEX, { jitaMid: 1, average: 4_690_000 }],
  [RIFTER_BPO, { jitaMid: 2_000_000, average: 2_900_000 }],
  [SKIN, { jitaMid: 500_000_000, average: 500_000_000 }],
  [SKILLBOOK, { jitaMid: 1_000_000, average: 1_000_000 }],
]);

const CATEGORIES: TypeCategories = new Map([
  [TRITANIUM, 4],
  [TENGU, 6],
  [OCULAR, 20],
  [MEMORY_AUG, 20],
  [PLEX, 17],
  [RIFTER_BPO, 9],
  [SKIN, 91],
  [SKILLBOOK, 16],
]);

describe('jitaMid', () => {
  it('averages both 5% percentiles, uses one side alone, and falls back to the best prices', () => {
    expect(jitaMid({ pct5Buy: 3, pct5Sell: 5, bestBuy: 1, bestSell: 9 })).toBe(4);
    expect(jitaMid({ pct5Buy: null, pct5Sell: 5, bestBuy: 1, bestSell: 9 })).toBe(5);
    expect(jitaMid({ pct5Buy: null, pct5Sell: null, bestBuy: 1, bestSell: 9 })).toBe(5);
    expect(jitaMid({ pct5Buy: null, pct5Sell: null, bestBuy: null, bestSell: 9 })).toBe(9);
    expect(jitaMid({ pct5Buy: null, pct5Sell: null, bestBuy: null, bestSell: null })).toBeNull();
  });
});

describe('unitValue', () => {
  it('takes the lower of Jita mid and CCP average, whichever exists, and null when neither', () => {
    expect(unitValue(TRITANIUM, { jitaMid: 4, average: 3.5 })).toBe(3.5);
    expect(unitValue(TENGU, { jitaMid: 200, average: 224 })).toBe(200);
    expect(unitValue(TENGU, { jitaMid: null, average: 224 })).toBe(224);
    expect(unitValue(TENGU, { jitaMid: 200, average: null })).toBe(200);
    expect(unitValue(TENGU, { jitaMid: null, average: null })).toBeNull();
    expect(unitValue(TENGU, undefined)).toBeNull();
  });

  it('prices PLEX at the CCP average even when a Jita figure exists', () => {
    expect(unitValue(PLEX, { jitaMid: 1, average: 4_690_000 })).toBe(4_690_000);
    expect(unitValue(PLEX, { jitaMid: 1, average: null })).toBeNull();
  });
});

describe('valueCharacter', () => {
  const hangar = (typeId: number, quantity: number, locationFlag = 'Hangar') => ({ typeId, quantity, locationFlag });

  it('sums wallet, priced assets, sell orders at unit value, buy escrow and implants', () => {
    const result = valueCharacter(
      {
        wallet: 1_000.5,
        assets: [hangar(TRITANIUM, 1_000_000), hangar(TENGU, 1, 'ShipHangar'), hangar(PLEX, 10)],
        activeImplants: [OCULAR],
        jumpCloneImplants: [[MEMORY_AUG], []],
        orders: [
          { typeId: TENGU, volumeRemain: 2, isBuyOrder: false, escrow: 0 },
          { typeId: TRITANIUM, volumeRemain: 500, isBuyOrder: true, escrow: 1_750 },
        ],
      },
      PRICES,
      CATEGORIES,
    );
    expect(result).toEqual({
      liquid: 1_000.5,
      assets: 3_500_000 + 224_000_000 + 46_900_000,
      sellOrders: 448_000_000,
      buyEscrow: 1_750,
      implants: 90_000_000 + 60_000_000,
      total: 1_000.5 + 274_400_000 + 448_000_000 + 1_750 + 150_000_000,
      unpriced: 0,
    });
  });

  it('excludes blueprints, SKINs, injected skillbooks and wardrobe items', () => {
    const result = valueCharacter(
      {
        wallet: 0,
        assets: [
          hangar(RIFTER_BPO, 3),
          hangar(SKIN, 1),
          hangar(SKILLBOOK, 1, 'Skill'),
          hangar(TRITANIUM, 10, 'Wardrobe'),
          hangar(TRITANIUM, 10),
        ],
        activeImplants: [],
        jumpCloneImplants: [],
        orders: [],
      },
      PRICES,
      CATEGORIES,
    );
    expect(result.assets).toBe(35);
    expect(result.total).toBe(35);
    expect(result.unpriced).toBe(0);
  });

  it('counts an implant once when it also appears as an Implant-flagged asset row', () => {
    const duplicated = valueCharacter(
      {
        wallet: 0,
        assets: [hangar(OCULAR, 1, 'Implant')],
        activeImplants: [OCULAR, MEMORY_AUG],
        jumpCloneImplants: [[OCULAR]],
        orders: [],
      },
      PRICES,
      CATEGORIES,
    );
    expect(duplicated.assets).toBe(90_000_000);
    expect(duplicated.implants).toBe(60_000_000 + 90_000_000);
    expect(duplicated.total).toBe(240_000_000);
  });

  it('values unpriced lines at zero and counts them', () => {
    const result = valueCharacter(
      {
        wallet: 5,
        assets: [hangar(UNPRICED, 10), hangar(TRITANIUM, 1)],
        activeImplants: [UNPRICED],
        jumpCloneImplants: [],
        orders: [{ typeId: UNPRICED, volumeRemain: 1, isBuyOrder: false, escrow: 0 }],
      },
      PRICES,
      CATEGORIES,
    );
    expect(result).toEqual({ total: 8.5, liquid: 5, assets: 3.5, sellOrders: 0, buyEscrow: 0, implants: 0, unpriced: 3 });
  });

  it('rounds to ISK cents', () => {
    const result = valueCharacter(
      { wallet: 0.1, assets: [hangar(TRITANIUM, 3)], activeImplants: [], jumpCloneImplants: [], orders: [] },
      new Map([[TRITANIUM, { jitaMid: 0.1, average: null }]]),
      CATEGORIES,
    );
    expect(result.assets).toBe(0.3);
    expect(result.total).toBe(0.4);
  });
});
