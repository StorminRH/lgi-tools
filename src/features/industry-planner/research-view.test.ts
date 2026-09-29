import { describe, expect, it } from 'vitest';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import {
  formatClearDays,
  researchRow,
  type ResearchPrice,
  type ResearchRow,
  sortResearchRows,
  spreadPct,
} from './research-view';

const entry = { typeId: 691, productTypeId: 587, name: 'Rifter Blueprint' };

const price: ResearchPrice = {
  bestBuy: 900,
  bestSell: 1000,
  buyDepth: [{ pct: 2, cumVolume: 40 }],
  sellDepth: [{ pct: 5, cumVolume: 200 }],
};

const history: MarketHistoryInputs = {
  typeId: 587,
  averageDailyVolume: [
    { days: 7, adv: 150 },
    { days: 30, adv: 100 },
  ],
  volumeCv: 0.3,
  priceVolatility: 0.05,
  daysCovered: 30,
  latestDate: '2026-09-27',
};

describe('spreadPct', () => {
  it('is the gap between buy and sell as a share of sell', () => {
    expect(spreadPct(900, 1000)).toBeCloseTo(10);
  });

  it('is unknown without both sides of the book', () => {
    expect(spreadPct(null, 1000)).toBeNull();
    expect(spreadPct(900, null)).toBeNull();
    expect(spreadPct(0, 1000)).toBeNull();
  });
});

describe('researchRow', () => {
  it('reads Jita prices, 30-day volume and a one-unit market score', () => {
    const row = researchRow(entry, 'Rifter', price, history);
    expect(row).toMatchObject({
      blueprintTypeId: 691,
      productTypeId: 587,
      name: 'Rifter',
      sell: 1000,
      buy: 900,
      dailyVolume: 100,
    });
    expect(row.spreadPct).toBeCloseTo(10);
    expect(row.clearDays).toBeCloseTo(2.01);
    expect(row.score).toBeGreaterThan(0);
  });

  it('leaves every figure unknown before data arrives', () => {
    expect(researchRow(entry, 'Rifter', undefined, undefined)).toEqual({
      blueprintTypeId: 691,
      productTypeId: 587,
      name: 'Rifter',
      sell: null,
      buy: null,
      spreadPct: null,
      dailyVolume: null,
      score: null,
      clearDays: null,
    });
  });
});

describe('sortResearchRows', () => {
  const row = (name: string, score: number | null, sell: number | null = null): ResearchRow => ({
    blueprintTypeId: 1,
    productTypeId: 2,
    name,
    sell,
    buy: null,
    spreadPct: null,
    dailyVolume: null,
    score,
    clearDays: null,
  });

  it('puts the highest figure first and unknowns last in list order', () => {
    const sorted = sortResearchRows([row('a', null), row('b', 40), row('c', null), row('d', 90)], 'score');
    expect(sorted.map((r) => r.name)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('sorts by the chosen column', () => {
    const sorted = sortResearchRows([row('a', 90, 5), row('b', 40, 50)], 'sell');
    expect(sorted.map((r) => r.name)).toEqual(['b', 'a']);
  });
});

describe('formatClearDays', () => {
  it('rounds to whole days and floors tiny waits', () => {
    expect(formatClearDays(null)).toBe('—');
    expect(formatClearDays(0.2)).toBe('<1d');
    expect(formatClearDays(3.6)).toBe('4d');
  });
});
