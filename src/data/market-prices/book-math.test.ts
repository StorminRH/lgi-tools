import { describe, expect, it } from 'vitest';
import {
  applySpreadFloorToBuyFigures,
  computeRegionalDiscount,
  filterBuyOrdersBelowSpreadFloor,
  isDiscountEligibleLocation,
  type RemoteStationBook,
} from './book-math';

// computeSide/computeDepth keep their long-standing regression suite in
// source.test.ts (imported via source.ts's re-export — the extraction must
// stay import-path-compatible). This file owns the 3.7.26.1 additions and
// the buy/sell spread floor.

const GATE = { minPct: 15, minUnits: 10 };

function books(
  ...entries: Array<[locationId: number, systemId: number, orders: Array<[price: number, volume: number]>]>
): Map<number, RemoteStationBook> {
  return new Map(
    entries.map(([loc, systemId, orders]) => [
      loc,
      { systemId, orders: orders.map(([price, volume]) => ({ price, volume: BigInt(volume) })) },
    ]),
  );
}

describe('computeRegionalDiscount', () => {
  it('surfaces a genuine remote discount with its system and surviving units', () => {
    // The RLML-shaped case: hub asks 255k, a real 19-unit front at 28k one
    // system out. 89% discount, 19 units ≥ 10 → fires.
    const remote = books([60000004, 30000143, [[28_000, 19], [300_000, 5]]]);
    const d = computeRegionalDiscount(remote, 255_000, GATE)!;
    expect(d).toEqual({
      systemId: 30000143,
      price: 28_000,
      units: 19,
      pct: expect.closeTo(89.02, 1),
    });
    expect(typeof d.units).toBe('number');
  });

  it('does NOT fire on a backwater sliver ladder — the per-station dust walk holds', () => {
    // [1,1,1,1,1] at −85% on a station whose real book sits above the hub
    // price: the station's dust-best is the real front (5 sliver units < the
    // 0.1%-of-5005 threshold… threshold = ceil(5005/1000) = 6 > 5), so the
    // sliver never anchors and the station's best (600) ≥ hub best (500).
    const remote = books([60000004, 30000143, [
      [75, 1], [76, 1], [77, 1], [78, 1], [79, 1],
      [600, 5_000],
    ]]);
    expect(computeRegionalDiscount(remote, 500, GATE)).toBeNull();
  });

  it('does NOT fire when the discount is under the pct gate', () => {
    // 10% under the hub best, deep book — fails the 15% gate.
    const remote = books([60000004, 30000143, [[90, 5_000]]]);
    expect(computeRegionalDiscount(remote, 100, GATE)).toBeNull();
  });

  it('does NOT fire when surviving units are under the unit gate', () => {
    // −50% but only 9 units priced at-or-under the hub best.
    const remote = books([60000004, 30000143, [[50, 9], [200, 10_000]]]);
    expect(computeRegionalDiscount(remote, 100, GATE)).toBeNull();
  });

  it('counts only units priced at-or-under the hub best as surviving', () => {
    // Station best 50 (−50%): 12 real units below the hub price, a modest
    // book above it. units = 12 — the 3,000 units at 150 sit ABOVE the hub
    // price and must not pad the gate. (The front carries the station's own
    // dust threshold: ceil(3,012/1,000) = 4 ≤ 12, so 50 is the dust-best.)
    const remote = books([60000004, 30000143, [[50, 12], [150, 3_000]]]);
    const d = computeRegionalDiscount(remote, 100, GATE)!;
    expect(d.units).toBe(12);
    expect(d.price).toBe(50);
  });

  it('returns the single best opportunity when several stations qualify', () => {
    const remote = books(
      [60000004, 30000143, [[40, 50]]],
      [60000005, 30000144, [[30, 50]]], // lowest surviving price wins
      [60000006, 30000145, [[45, 50]]],
    );
    const d = computeRegionalDiscount(remote, 100, GATE)!;
    expect(d.systemId).toBe(30000144);
    expect(d.price).toBe(30);
  });

  it('returns null with no hub best to measure against', () => {
    const remote = books([60000004, 30000143, [[50, 100]]]);
    expect(computeRegionalDiscount(remote, null, GATE)).toBeNull();
  });

  it('returns null for an empty remote map', () => {
    expect(computeRegionalDiscount(new Map(), 100, GATE)).toBeNull();
  });
});

describe('filterBuyOrdersBelowSpreadFloor', () => {
  it('drops hub bids priced under 35% of the dust-filtered ask', () => {
    // C320-shaped: a 1e9 @ 0.01 wall plus a penny-and-change bid sit
    // under 0.35 × 31_000; the real 30_250 bid stays.
    const kept = filterBuyOrdersBelowSpreadFloor(
      [
        { price: 0.01, volume: BigInt(1_000_000_000) },
        { price: 30_250, volume: BigInt(100) },
        { price: 1.01, volume: BigInt(100_000) },
      ],
      31_000,
    );
    expect(kept).toEqual([{ price: 30_250, volume: BigInt(100) }]);
  });

  it('keeps a bid exactly on the 35% floor', () => {
    expect(
      filterBuyOrdersBelowSpreadFloor([{ price: 35, volume: BigInt(1) }], 100),
    ).toEqual([{ price: 35, volume: BigInt(1) }]);
  });

  it('drops a bid just under the 35% floor', () => {
    expect(
      filterBuyOrdersBelowSpreadFloor([{ price: 34.99, volume: BigInt(1) }], 100),
    ).toEqual([]);
  });

  it('returns the buy book unchanged when there is no ask to measure against', () => {
    const orders = [{ price: 0.01, volume: BigInt(1_000_000_000) }];
    expect(filterBuyOrdersBelowSpreadFloor(orders, null)).toBe(orders);
  });

  it('returns the buy book unchanged when the ask is not a positive price', () => {
    const orders = [{ price: 0.01, volume: BigInt(1) }];
    expect(filterBuyOrdersBelowSpreadFloor(orders, 0)).toBe(orders);
  });
});

describe('applySpreadFloorToBuyFigures', () => {
  it('nulls the whole buy side when the best bid is under 35% of the ask', () => {
    expect(
      applySpreadFloorToBuyFigures(
        { bestBuy: 0.01, pct5Buy: 0.01, buyVolume: BigInt(1_000_000_000) },
        30_000,
      ),
    ).toEqual({ bestBuy: null, pct5Buy: null, buyVolume: null });
  });

  it('nulls only pct5 when the percentile is diluted but the max bid clears', () => {
    // C50-shaped Fuzzwork aggregate: max is the real bid, percentile
    // walked the 1e9 wall.
    expect(
      applySpreadFloorToBuyFigures(
        { bestBuy: 4_604, pct5Buy: 139, buyVolume: BigInt(1_000_000_100) },
        4_700,
      ),
    ).toEqual({
      bestBuy: 4_604,
      pct5Buy: null,
      buyVolume: BigInt(1_000_000_100),
    });
  });

  it('leaves healthy aggregates untouched', () => {
    expect(
      applySpreadFloorToBuyFigures(
        { bestBuy: 5.2, pct5Buy: 5.0, buyVolume: BigInt(1_000_000) },
        5.5,
      ),
    ).toEqual({ bestBuy: 5.2, pct5Buy: 5.0, buyVolume: BigInt(1_000_000) });
  });

  it('leaves buy figures untouched when there is no ask', () => {
    const figures = {
      bestBuy: 0.01,
      pct5Buy: 0.01,
      buyVolume: BigInt(10),
    };
    expect(applySpreadFloorToBuyFigures(figures, null)).toBe(figures);
  });
});

describe('isDiscountEligibleLocation', () => {
  it('accepts NPC stations and rejects player structures', () => {
    expect(isDiscountEligibleLocation(60003760)).toBe(true);
    expect(isDiscountEligibleLocation(60000004)).toBe(true);
    // Citadel-range ids (~1.03e12) are ACL-gateable — never callout anchors.
    expect(isDiscountEligibleLocation(1_035_466_617_946)).toBe(false);
  });
});
