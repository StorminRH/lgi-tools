import { describe, expect, it } from 'vitest';
import type { MarketDay } from '@/data/industry-math/market-analytics';
import { batchPlan, DEFAULT_ASSUMPTIONS, researchInsight, type ResearchSource, sortInsights } from './research-insight';
import type { ResearchEconomics } from './types';

const economics: ResearchEconomics = {
  blueprintTypeId: 691,
  productTypeId: 587,
  activityId: 1,
  quantityPerRun: 1,
  jobSeconds: 6000,
  inputCost: 380_000,
  jobFee: 20_000,
  incomplete: false,
  drivers: [],
};

function days(n: number, price: (i: number) => number, volume = 400): MarketDay[] {
  return Array.from({ length: n }, (_, i) => {
    const average = price(i);
    return {
      date: new Date(Date.UTC(2026, 6, 1) + i * 86_400_000).toISOString().slice(0, 10),
      average,
      highest: average * 1.01,
      lowest: average * 0.99,
      volume,
      orderCount: 300,
    };
  });
}

const steady = days(104, (i) => 500_000 * (1 + 0.004 * Math.sin(i)));

function source(overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    entry: { typeId: 691, productTypeId: 587, name: 'Rifter' },
    name: 'Rifter',
    price: { bestSell: 505_000, bestBuy: 490_000, buyDepth: null, sellDepth: null },
    history: {
      typeId: 587,
      averageDailyVolume: [{ days: 30, adv: 400 }],
      volumeCv: 0.1,
      priceVolatility: 0.01,
      daysCovered: 30,
      latestDate: '2026-10-12',
    },
    series: steady,
    economics,
    ...overrides,
  };
}

describe('batchPlan', () => {
  it('fills a slot-day with whole runs and adds half the selling window', () => {
    const plan = batchPlan(economics, 400, DEFAULT_ASSUMPTIONS);
    expect(plan.runs).toBe(14);
    expect(plan.units).toBe(14);
    expect(plan.buildDays).toBeCloseTo((14 * 6000) / 86_400, 9);
    expect(plan.sellDays).toBeCloseTo(14 / (400 * 0.2), 9);
    expect(plan.horizonDays).toBeCloseTo(plan.buildDays + (plan.sellDays ?? 0) / 2, 9);
  });

  it('builds one run without a job time, and a week of runs for a slot-week', () => {
    expect(batchPlan({ ...economics, jobSeconds: null }, 400, DEFAULT_ASSUMPTIONS)).toMatchObject({ runs: 1, buildDays: 0 });
    expect(batchPlan(economics, 400, { ...DEFAULT_ASSUMPTIONS, batch: 'slotWeek' }).runs).toBe(100);
    expect(batchPlan(economics, null, { ...DEFAULT_ASSUMPTIONS, batch: 'run' })).toMatchObject({ runs: 1, sellDays: null });
  });
});

describe('researchInsight', () => {
  it('prices a steady, profitable product with strong confidence', () => {
    const insight = researchInsight(source(), DEFAULT_ASSUMPTIONS);
    expect(insight.loading).toBe(false);
    expect(insight.unit?.cost).toBe(400_000);
    expect(insight.outlook?.probProfit).toBeGreaterThan(0.9);
    expect(insight.iskPerHour).toBeGreaterThan(0);
    expect(insight.svr).toBeCloseTo(400 / (86_400 / 6000), 9);
    expect(insight.gates).toEqual([]);
    expect(insight.band).toBe('high');
    expect(insight.days).toHaveLength(90);
    expect(insight.spreadPct).toBeCloseTo(((505_000 - 490_000) / 505_000) * 100, 9);
  });

  it('screens a build that loses money', () => {
    const insight = researchInsight(source({ economics: { ...economics, inputCost: 520_000 } }), DEFAULT_ASSUMPTIONS);
    expect(insight.gates.map((g) => g.id)).toContain('unprofitable');
    expect(insight.outlook?.probProfit).toBeLessThan(0.1);
  });

  it('screens a market too thin for the batch, and one without history', () => {
    const thin = researchInsight(source({ series: days(104, () => 500_000, 0.2) }), DEFAULT_ASSUMPTIONS);
    expect(thin.gates.map((g) => g.id)).toContain('illiquid');
    const slow = researchInsight(source({ series: days(104, () => 500_000, 3) }), DEFAULT_ASSUMPTIONS);
    expect(slow.gates.map((g) => g.id)).toContain('oversized');
    const fresh = researchInsight(source({ series: days(5, () => 500_000) }), DEFAULT_ASSUMPTIONS);
    expect(fresh.gates.map((g) => g.id)).toContain('thinHistory');
  });

  it('reads as loading until prices and history arrive, and unpriced without a blueprint', () => {
    const pending = researchInsight(source({ price: undefined, series: undefined, economics: undefined }), DEFAULT_ASSUMPTIONS);
    expect(pending.loading).toBe(true);
    expect(pending.outlook).toBeNull();
    expect(pending.batch).toBeNull();
    const noSell = researchInsight(source({ price: { bestSell: null, bestBuy: null, buyDepth: null, sellDepth: null } }), DEFAULT_ASSUMPTIONS);
    expect(noSell.unit).toBeNull();
    expect(noSell.spreadPct).toBeNull();
    expect(noSell.standing).toBeNull();
  });

  it('prices an instant sale at the bid less sales tax', () => {
    const insight = researchInsight(source(), DEFAULT_ASSUMPTIONS);
    expect(insight.unit?.instantNet).toBeCloseTo(490_000 * (1 - 0.075) - 400_000, 6);
    const noBid = researchInsight(source({ price: { bestSell: 505_000, bestBuy: null, buyDepth: null, sellDepth: null } }), DEFAULT_ASSUMPTIONS);
    expect(noBid.unit?.instantNet).toBeNull();
    expect(researchInsight(source({ economics: { ...economics, jobSeconds: 0 } }), DEFAULT_ASSUMPTIONS).iskPerHour).toBeNull();
  });
});

describe('sortInsights', () => {
  it('orders highest first and sinks unknowns', () => {
    const good = researchInsight(source(), DEFAULT_ASSUMPTIONS);
    const bad = researchInsight(source({ entry: { typeId: 2, productTypeId: 3, name: 'Bad' }, name: 'Bad', economics: { ...economics, inputCost: 600_000 } }), DEFAULT_ASSUMPTIONS);
    const unknown = researchInsight(source({ entry: { typeId: 4, productTypeId: 5, name: 'New' }, name: 'New', economics: null }), DEFAULT_ASSUMPTIONS);
    for (const key of ['margin', 'iskPerHour'] as const) {
      expect(sortInsights([unknown, bad, good], key).map((i) => i.name)).toEqual(['Rifter', 'Bad', 'New']);
    }
    expect(sortInsights([bad, good], 'confidence')[0]?.name).toBe('Rifter');
    expect(sortInsights([good, bad], 'iskVolume')).toHaveLength(2);
    expect(sortInsights([good, unknown], 'momentum')).toHaveLength(2);
  });
});
