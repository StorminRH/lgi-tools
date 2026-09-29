import { describe, expect, it } from 'vitest';
import type { MarketDay } from '@/data/industry-math/market-analytics';
import { DEFAULT_ASSUMPTIONS, researchInsight, type ResearchSource } from './research-insight';
import {
  confidenceHeadline,
  factorDetails,
  fillMixText,
  formatDays,
  keyFigures,
  signedPct,
  standingText,
  trendText,
  weakestText,
} from './research-insight-view';

function days(n: number, price: (i: number) => number, volume = 400): MarketDay[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2026, 6, 1) + i * 86_400_000).toISOString().slice(0, 10),
    average: price(i),
    highest: price(i) * 1.01,
    lowest: price(i) * 0.99,
    volume,
    orderCount: 200,
  }));
}

function source(series: MarketDay[] | undefined, inputCost = 380_000): ResearchSource {
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
    series,
    economics: {
      blueprintTypeId: 691,
      productTypeId: 587,
      activityId: 1,
      quantityPerRun: 1,
      jobSeconds: 6000,
      inputCost,
      jobFee: 20_000,
      incomplete: false,
      drivers: [],
    },
  };
}

const steady = researchInsight(source(days(104, (i) => 500_000 * (1 + 0.004 * Math.sin(i)))), DEFAULT_ASSUMPTIONS);
const sliding = researchInsight(source(days(104, (i) => 500_000 * Math.exp(0.01 * (103 - i)))), DEFAULT_ASSUMPTIONS);
const empty = researchInsight(source([]), DEFAULT_ASSUMPTIONS);

describe('formatting', () => {
  it('reads days as hours under one day', () => {
    expect(formatDays(null)).toBe('—');
    expect(formatDays(0.25)).toBe('6h');
    expect(formatDays(3.44)).toBe('3.4d');
    expect(formatDays(21.6)).toBe('22d');
  });

  it('signs a percent', () => {
    expect(signedPct(2.345)).toBe('+2.3%');
    expect(signedPct(-4)).toBe('−4.0%');
    expect(signedPct(null)).toBe('—');
  });
});

describe('keyFigures', () => {
  it('tones a good build green and gives every figure a note', () => {
    const figures = keyFigures(steady);
    expect(figures.map((f) => f.id)).toEqual(['margin', 'odds', 'iskh', 'sell', 'svr', 'vol', 'flow', 'instant']);
    expect(figures.find((f) => f.id === 'odds')?.tone).toBe('good');
    expect(figures.every((f) => f.note.length > 0)).toBe(true);
  });

  it('marks a losing build and an unknown one', () => {
    const losing = keyFigures(researchInsight(source(days(104, () => 500_000), 520_000), DEFAULT_ASSUMPTIONS));
    expect(losing.find((f) => f.id === 'margin')?.tone).toBe('bad');
    expect(losing.find((f) => f.id === 'iskh')?.tone).toBe('bad');
    const unknown = keyFigures(empty);
    expect(unknown.find((f) => f.id === 'vol')).toMatchObject({ value: '—', tone: 'plain' });
    expect(unknown.find((f) => f.id === 'flow')?.note).toBe('—');
  });
});

describe('confidence text', () => {
  it('names what each factor read', () => {
    const details = factorDetails(steady);
    expect(details.history).toBe('Traded 30 of 30 days');
    expect(details.profitOdds).toMatch(/above breakeven/);
    expect(factorDetails(empty).trend).toBe('Needs two weeks');
  });

  it('says what holds the score back, or that little does', () => {
    expect(confidenceHeadline(steady)).toMatch(/^Solid across the board|^Held back by/);
    expect(confidenceHeadline(sliding)).toMatch(/^Held back by trend \(−\d+\)/);
    expect(weakestText(sliding)).toMatch(/^Weakest: trend/);
  });

  it('describes the trend, standing and fill mix', () => {
    expect(trendText(sliding)).toMatch(/^Sliding −/);
    expect(trendText(empty)).toBe('—');
    expect(standingText(sliding)).toMatch(/norm/);
    expect(standingText(empty)).toBe('—');
    expect(fillMixText(steady)).toMatch(/% of volume filled sell orders$/);
    expect(fillMixText(empty)).toBe('—');
  });
});
