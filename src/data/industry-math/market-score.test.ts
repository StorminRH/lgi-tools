import { describe, expect, it } from 'vitest';
import {
  CLEAR_DAYS_MAX,
  CONSISTENCY_CV_MAX,
  computeMarketScore,
  STABILITY_CV_MAX,
  type MarketScoreInputs,
} from './market-score';

// A fully-liquid baseline: a tiny batch against deep, steady, stable demand —
// every sub-signal near its max. Individual tests override one field at a time.
const LIQUID: MarketScoreInputs = {
  outputUnits: 10,
  adv: 100_000, // a day clears the batch many times over
  sellWallUnits: 0, // no wall ahead
  instantDumpUnits: 5_000,
  priceVolatility: 0, // rock-steady price
  volumeCv: 0, // trades the same volume every day
};

describe('computeMarketScore — liquidity (time-to-clear)', () => {
  it('scores a small batch on a liquid item near the top', () => {
    const s = computeMarketScore(LIQUID);
    expect(s.liquidity.score).toBeCloseTo(1, 4);
    expect(s.score).toBe(100);
    expect(s.knownCount).toBe(3);
  });

  it('degrades as the batch grows (quantity-relative)', () => {
    const small = computeMarketScore({ ...LIQUID, outputUnits: 100_000 }); // ~1 day
    const huge = computeMarketScore({ ...LIQUID, outputUnits: 1_500_000 }); // ~15 days
    expect(huge.liquidity.score!).toBeLessThan(small.liquidity.score!);
    expect(huge.score!).toBeLessThan(small.score!);
  });

  it('counts the sell-side wall plus the batch against ADV', () => {
    // adv 1000/day, batch 5000 (5 days) + wall 10000 (10 days) = 15 days to clear.
    const s = computeMarketScore({
      ...LIQUID,
      adv: 1_000,
      outputUnits: 5_000,
      sellWallUnits: 10_000,
    });
    expect(s.liquidity.batchDays).toBeCloseTo(5, 6);
    expect(s.liquidity.sellWallDays).toBeCloseTo(10, 6);
    expect(s.liquidity.timeToClearDays).toBeCloseTo(15, 6);
    expect(s.liquidity.wallKnown).toBe(true);
    expect(s.liquidity.score).toBeCloseTo(1 - 15 / CLEAR_DAYS_MAX, 6);
  });

  it('bottoms out at zero once the clear time reaches the cap', () => {
    const s = computeMarketScore({
      ...LIQUID,
      adv: 1,
      outputUnits: CLEAR_DAYS_MAX + 100, // well over a month of volume
    });
    expect(s.liquidity.score).toBe(0);
  });

  it('treats an unknown wall as a lower bound (batch only), flagged', () => {
    const s = computeMarketScore({
      ...LIQUID,
      adv: 1_000,
      outputUnits: 5_000,
      sellWallUnits: null,
    });
    expect(s.liquidity.wallKnown).toBe(false);
    expect(s.liquidity.sellWallDays).toBeNull();
    expect(s.liquidity.timeToClearDays).toBeCloseTo(5, 6); // batch only
    expect(s.liquidity.score).not.toBeNull();
  });

  it('reports liquidity unknown when ADV is unknown', () => {
    const s = computeMarketScore({ ...LIQUID, adv: null });
    expect(s.liquidity.score).toBeNull();
    expect(s.liquidity.timeToClearDays).toBeNull();
  });

  it('carries the buy-side instant-dump units through unscored', () => {
    const s = computeMarketScore({ ...LIQUID, instantDumpUnits: 4_100 });
    expect(s.liquidity.instantDumpUnits).toBe(4_100);
  });
});

describe('computeMarketScore — stability & consistency', () => {
  it('reads price volatility out as a percentage swing', () => {
    const s = computeMarketScore({ ...LIQUID, priceVolatility: 0.12 });
    expect(s.stability.swingPct).toBeCloseTo(12, 6);
    expect(s.stability.score).toBeCloseTo(1 - 0.12 / STABILITY_CV_MAX, 6);
  });

  it('words the demand-consistency band instead of a raw coefficient', () => {
    expect(computeMarketScore({ ...LIQUID, volumeCv: 0.2 }).consistency.band).toBe('steady');
    expect(computeMarketScore({ ...LIQUID, volumeCv: 0.8 }).consistency.band).toBe('moderate');
    expect(computeMarketScore({ ...LIQUID, volumeCv: 2 }).consistency.band).toBe('spiky');
  });
});

describe('computeMarketScore — weakest-link composition', () => {
  it('floors the final score when one KNOWN signal is zero', () => {
    // Liquidity and consistency maxed; price volatility past the cap → stability 0.
    const s = computeMarketScore({
      ...LIQUID,
      priceVolatility: STABILITY_CV_MAX + 0.2,
    });
    expect(s.stability.score).toBe(0);
    expect(s.score).toBe(0); // the weakest link caps the total
    expect(s.knownCount).toBe(3);
  });

  it('also floors when the zeroed signal is consistency', () => {
    const s = computeMarketScore({ ...LIQUID, volumeCv: CONSISTENCY_CV_MAX + 1 });
    expect(s.consistency.score).toBe(0);
    expect(s.score).toBe(0);
  });

  it('is a geometric mean, not an arithmetic average (penalizes imbalance)', () => {
    // One weak signal among strong ones: the geometric mean sits well below the
    // weighted arithmetic mean of the same sub-scores.
    const s = computeMarketScore({
      ...LIQUID,
      outputUnits: 3 * 100_000, // liquidity ≈ 0.9 (3 days of 30)
      priceVolatility: STABILITY_CV_MAX * 0.1, // stability ≈ 0.9
      volumeCv: CONSISTENCY_CV_MAX * 0.9, // consistency ≈ 0.1
    });
    const arithmetic =
      (0.5 * s.liquidity.score! + 0.25 * s.stability.score! + 0.25 * s.consistency.score!) * 100;
    expect(s.score!).toBeLessThan(arithmetic);
  });
});

describe('computeMarketScore — honest degradation', () => {
  it('excludes an unknown signal without flooring or fabricating', () => {
    // Stability unknown (<2 priced days); the other two maxed → full score from 2.
    const s = computeMarketScore({ ...LIQUID, priceVolatility: null });
    expect(s.stability.score).toBeNull();
    expect(s.score).toBe(100); // unknown is excluded, NOT treated as zero
    expect(s.knownCount).toBe(2);
  });

  it('returns a null score (not a number) when nothing is known', () => {
    const s = computeMarketScore({
      outputUnits: 10,
      adv: null,
      sellWallUnits: null,
      instantDumpUnits: null,
      priceVolatility: null,
      volumeCv: null,
    });
    expect(s.score).toBeNull();
    expect(s.knownCount).toBe(0);
  });

  it('scores from a single known signal alone', () => {
    const s = computeMarketScore({
      ...LIQUID,
      adv: null, // liquidity unknown
      volumeCv: null, // consistency unknown
      priceVolatility: 0, // stability = 1
    });
    expect(s.knownCount).toBe(1);
    expect(s.score).toBe(100);
  });
});
