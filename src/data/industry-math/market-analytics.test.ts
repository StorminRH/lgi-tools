import { describe, expect, it } from 'vitest';
import {
  clipRanges,
  dailyVolatility,
  DRIFT_CAP_PER_DAY,
  drawdown,
  ema,
  expectedListPrice,
  fillDays,
  flowStats,
  logReturns,
  type MarketDay,
  momentum,
  movingAverage,
  normalCdf,
  priceStanding,
  priceTrend,
  profitOutlook,
  projectedDrift,
  projectPrice,
  robustSigma,
  sellSideShare,
  sellThroughDays,
  UNDERCUT_MAX,
  UNDERCUT_MIN,
  stdDev,
  weekdayVolumeIndex,
} from './market-analytics';

function day(date: string, average: number, volume = 100, orderCount = 10): MarketDay {
  return { date, average, highest: average * 1.02, lowest: average * 0.98, volume, orderCount };
}

// 2026-09-01 is a Tuesday.
function run(prices: number[], start = Date.UTC(2026, 8, 1)): MarketDay[] {
  return prices.map((price, i) => day(new Date(start + i * 86_400_000).toISOString().slice(0, 10), price));
}

describe('fillDays', () => {
  it('returns nothing for no rows', () => {
    expect(fillDays([], 30)).toEqual([]);
    expect(fillDays(run([1]), 0)).toEqual([]);
  });

  it('keeps the last N calendar days ending on the latest row', () => {
    const filled = fillDays(run([1, 2, 3, 4, 5]), 3);
    expect(filled.map((d) => d.average)).toEqual([3, 4, 5]);
    expect(filled.every((d) => d.traded)).toBe(true);
  });

  it('carries the price across a quiet day at zero volume', () => {
    const rows = [day('2026-09-01', 10), day('2026-09-03', 12)];
    const filled = fillDays(rows, 3);
    expect(filled.map((d) => [d.date, d.average, d.volume, d.traded])).toEqual([
      ['2026-09-01', 10, 100, true],
      ['2026-09-02', 10, 0, false],
      ['2026-09-03', 12, 100, true],
    ]);
  });

  it('seeds the carry price from before the window', () => {
    const rows = [day('2026-08-20', 7), day('2026-09-03', 12)];
    const filled = fillDays(rows, 3);
    expect(filled.map((d) => d.average)).toEqual([7, 7, 12]);
    expect(filled[0]?.traded).toBe(false);
  });

  it('drops days before the first trade', () => {
    const filled = fillDays([day('2026-09-03', 12)], 5);
    expect(filled).toHaveLength(1);
  });
});

describe('movingAverage and stdDev', () => {
  it('averages a trailing window, null until it fills', () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it('takes the sample standard deviation', () => {
    expect(stdDev([1])).toBeNull();
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
});

describe('volatility and trend', () => {
  it('reads log returns across traded days, scaled to one day over a gap', () => {
    const filled = fillDays([day('2026-09-01', 100), day('2026-09-03', 110)], 3);
    expect(logReturns(filled)).toEqual([Math.log(1.1) / Math.SQRT2]);
  });

  it('shrugs off a single wild day', () => {
    const calm = [100, 101, 100, 101, 100, 101, 100, 101, 100, 101];
    const spiked = [...calm.slice(0, 5), 160, ...calm.slice(6)];
    const base = dailyVolatility(fillDays(run(calm), 10)) ?? 0;
    const robust = dailyVolatility(fillDays(run(spiked), 10)) ?? 0;
    expect(robust).toBeLessThan(base * 3);
    expect(robustSigma([1, 1, 1])).toBe(0);
  });

  it('needs five returns for a volatility', () => {
    expect(dailyVolatility(fillDays(run([1, 2, 3]), 3))).toBeNull();
    expect(dailyVolatility(fillDays(run([100, 100, 100, 100, 100, 100]), 6))).toBe(0);
  });

  it('fits a steady climb with a perfect r²', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 * Math.exp(0.01 * i));
    const trend = priceTrend(fillDays(run(prices), 30));
    expect(trend?.slopePerDay).toBeCloseTo(0.01, 6);
    expect(trend?.r2).toBeCloseTo(1, 6);
    expect(trend?.pctPer30d).toBeCloseTo(Math.exp(0.3) - 1, 6);
  });

  it('reports no fit on a flat market', () => {
    const trend = priceTrend(fillDays(run([5, 5, 5, 5, 5, 5]), 6));
    expect(trend).toEqual({ slopePerDay: 0, pctPer30d: 0, r2: 0 });
    expect(priceTrend(fillDays(run([5, 5]), 2))).toBeNull();
  });

  it('damps and caps the drift it carries forward', () => {
    expect(projectedDrift(null)).toBe(0);
    expect(projectedDrift({ slopePerDay: 0.01, pctPer30d: 0, r2: 0.5 })).toBeCloseTo(0.0025, 9);
    expect(projectedDrift({ slopePerDay: 0.2, pctPer30d: 0, r2: 1 })).toBe(DRIFT_CAP_PER_DAY);
    expect(projectedDrift({ slopePerDay: -0.2, pctPer30d: 0, r2: 1 })).toBe(-DRIFT_CAP_PER_DAY);
  });
});

describe('priceStanding', () => {
  const filled = fillDays(run([90, 100, 110, 100, 90, 100, 110]), 7);

  it('reads a high price as rich and a low one as cheap', () => {
    expect(priceStanding(130, filled)?.position).toBe('rich');
    expect(priceStanding(70, filled)?.position).toBe('cheap');
    expect(priceStanding(100, filled)?.position).toBe('fair');
  });

  it('needs two traded days and treats a flat market as fair', () => {
    expect(priceStanding(100, fillDays(run([100]), 1))).toBeNull();
    expect(priceStanding(0, filled)).toBeNull();
    expect(priceStanding(120, fillDays(run([100, 100]), 2))).toMatchObject({ z: 0, position: 'fair' });
  });
});

describe('momentum and drawdown', () => {
  it('seeds an exponential average on its first value', () => {
    expect(ema([10, 10, 10], 3)).toEqual([10, 10, 10]);
    expect(ema([10, 20], 3)[1]).toBeCloseTo(15, 9);
  });

  it('reads a week running above its month as rising', () => {
    const climbing = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
    expect(momentum(fillDays(run(climbing), 40))?.direction).toBe('rising');
    const sliding = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
    expect(momentum(fillDays(run(sliding), 40))?.direction).toBe('falling');
    const flat = momentum(fillDays(run(Array.from({ length: 20 }, () => 50)), 20));
    expect(flat?.direction).toBe('flat');
    expect(flat?.ratio).toBeCloseTo(0, 9);
    expect(momentum(fillDays(run([1, 2, 3]), 3))).toBeNull();
  });

  it('measures the fall from the window peak', () => {
    expect(drawdown(fillDays(run([100, 120, 90]), 3))).toBeCloseTo(0.25, 9);
    expect(drawdown([])).toBeNull();
  });
});

describe('clipRanges', () => {
  it('pulls a fat-finger high back to the typical range', () => {
    const rows = run(Array.from({ length: 20 }, () => 100));
    rows[10] = { ...rows[10]!, highest: 500 };
    const { days, clippedShare } = clipRanges(fillDays(rows, 20));
    expect(days[10]?.high).toBeLessThan(110);
    expect(days[9]?.high).toBeCloseTo(102, 9);
    expect(clippedShare).toBeCloseTo(1 / 20, 9);
  });

  it('reads where the average sits in the range as the sell-side share', () => {
    const rows: MarketDay[] = [
      { date: '2026-09-01', average: 108, highest: 110, lowest: 100, volume: 100, orderCount: 5 },
      { date: '2026-09-02', average: 102, highest: 110, lowest: 100, volume: 300, orderCount: 5 },
    ];
    const { days } = clipRanges(fillDays(rows, 2));
    expect(days[0]?.sellShare).toBeCloseTo(0.8, 9);
    expect(sellSideShare(days)).toBeCloseTo((0.8 * 100 + 0.2 * 300) / 400, 9);
    expect(sellSideShare([])).toBeNull();
  });

  it('handles an empty window', () => {
    expect(clipRanges([])).toEqual({ days: [], clippedShare: 0 });
  });
});

describe('expectedListPrice', () => {
  it('never lists above the current ask and allows for undercutting', () => {
    const { days } = clipRanges(fillDays(run(Array.from({ length: 10 }, () => 100)), 10));
    const list = expectedListPrice(120, days);
    expect(list.undercut).toBeCloseTo(0.02, 9);
    expect(list.price).toBeCloseTo(((120 + 102) / 2) * 0.98, 9);
    expect(expectedListPrice(90, days).price).toBeCloseTo(90 * 0.98, 9);
  });

  it('keeps the undercut inside its bounds without history', () => {
    expect(expectedListPrice(100, [])).toEqual({ price: 100 * (1 - UNDERCUT_MIN), undercut: UNDERCUT_MIN });
    const wide = clipRanges(fillDays(run([100, 100]).map((row) => ({ ...row, highest: 150, lowest: 50 })), 2)).days;
    expect(expectedListPrice(100, wide).undercut).toBe(UNDERCUT_MAX);
  });
});

describe('projection', () => {
  it('matches the standard normal', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.2815515655446004)).toBeCloseTo(0.9, 6);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
  });

  it('widens with the square root of time', () => {
    const one = projectPrice(100, 0.02, 0, 1);
    const four = projectPrice(100, 0.02, 0, 4);
    expect(Math.log(four.p90 / four.p50)).toBeCloseTo(2 * Math.log(one.p90 / one.p50), 9);
    expect(one.p10).toBeLessThan(one.p50);
  });

  it('puts even odds on the median', () => {
    const p = projectPrice(100, 0.03, 0.001, 10);
    expect(p.probAbove(p.p50)).toBeCloseTo(0.5, 6);
    expect(p.probAbove(p.p10)).toBeCloseTo(0.9, 5);
    expect(p.probAbove(0)).toBe(1);
  });

  it('is certain without volatility', () => {
    const p = projectPrice(100, 0, 0, 5);
    expect(p.probAbove(99)).toBe(1);
    expect(p.probAbove(101)).toBe(0);
  });

  it('prices the margin band and the odds of clearing breakeven', () => {
    const outlook = profitOutlook({
      unitCost: 80,
      spot: 100,
      sellFeeRate: 0.05,
      dailyVol: 0,
      driftPerDay: 0,
      horizonDays: 3,
    });
    expect(outlook.breakeven).toBeCloseTo(80 / 0.95, 9);
    expect(outlook.netPerUnit.p50).toBeCloseTo(15, 9);
    expect(outlook.marginPct.p50).toBeCloseTo(15, 9);
    expect(outlook.cushion).toBeCloseTo(1 - 80 / 95, 9);
    expect(outlook.probProfit).toBe(1);
  });

  it('gives worse odds as volatility rises', () => {
    const base = { unitCost: 90, spot: 100, sellFeeRate: 0.05, driftPerDay: 0, horizonDays: 7 };
    const calm = profitOutlook({ ...base, dailyVol: 0.005 });
    const wild = profitOutlook({ ...base, dailyVol: 0.06 });
    expect(wild.probProfit).toBeLessThan(calm.probProfit);
    expect(profitOutlook({ ...base, spot: 0, dailyVol: 0 }).cushion).toBe(0);
  });
});

describe('flow', () => {
  it('reads days to sell at a market share', () => {
    expect(sellThroughDays(100, 50, 0.5)).toBe(4);
    expect(sellThroughDays(100, null, 0.5)).toBeNull();
    expect(sellThroughDays(100, 50, 0)).toBeNull();
  });

  it('sums volume, ISK and fills across the window', () => {
    const filled = fillDays([day('2026-09-01', 10, 100, 20), day('2026-09-03', 20, 50, 0)], 3);
    expect(flowStats(filled)).toEqual({
      adv: 50,
      iskPerDay: (1000 + 1000) / 3,
      unitsPerOrder: 150 / 20,
      tradedDays: 2,
      days: 3,
    });
    expect(flowStats([])).toBeNull();
  });

  it('reports no fill size without orders', () => {
    const filled = fillDays([{ ...day('2026-09-01', 10), orderCount: 0 }], 1);
    expect(flowStats(filled)?.unitsPerOrder).toBeNull();
  });

  it('indexes each weekday against the average day, Monday first', () => {
    // 2026-08-31 is a Monday; Saturdays trade double.
    const rows = Array.from({ length: 28 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 7, 31) + i * 86_400_000).toISOString().slice(0, 10);
      return day(date, 10, i % 7 === 5 ? 200 : 100);
    });
    const index = weekdayVolumeIndex(fillDays(rows, 28));
    expect(index).toHaveLength(7);
    expect(index?.[5]).toBeCloseTo(200 / (800 / 7), 9);
    expect(index?.[0]).toBeCloseTo(100 / (800 / 7), 9);
  });

  it('needs two weeks and some volume', () => {
    expect(weekdayVolumeIndex(fillDays(run([1, 2, 3]), 3))).toBeNull();
    const quiet = run(Array.from({ length: 14 }, () => 10)).map((row) => ({ ...row, volume: 0 }));
    expect(weekdayVolumeIndex(fillDays(quiet, 14))).toBeNull();
  });
});
