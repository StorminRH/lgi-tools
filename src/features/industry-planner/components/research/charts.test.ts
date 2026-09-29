import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MarketDay } from '@/data/industry-math/market-analytics';
import { DEFAULT_ASSUMPTIONS, researchInsight, type ResearchSource } from '../../research-insight';
import { ChartLegend, iskTick, MeterBar, shortDate } from './chart-kit';
import { marginDomain, OpportunityMap, placeLabels, Spark, WeekdayBars } from './MarketCharts';
import { ConfidenceBars, ConfidenceDial, ConfidenceWaterfall, MarginBreakdown, marginParts, ProfitDistribution } from './OutlookCharts';
import { PriceChart, priceLegend, VolumeChart } from './PriceChart';

function days(n: number): MarketDay[] {
  return Array.from({ length: n }, (_, i) => {
    const average = 500_000 * (1 + 0.01 * Math.sin(i / 3));
    return {
      date: new Date(Date.UTC(2026, 6, 1) + i * 86_400_000).toISOString().slice(0, 10),
      average,
      highest: average * 1.02,
      lowest: average * 0.98,
      volume: 300 + (i % 7) * 20,
      orderCount: 250,
    };
  });
}

function insightFor(series: MarketDay[], priced = true) {
  const source: ResearchSource = {
    entry: { typeId: 691, productTypeId: 587, name: 'Rifter' },
    name: 'Rifter',
    price: { bestSell: 505_000, bestBuy: 490_000, buyDepth: null, sellDepth: null },
    history: null,
    series,
    economics: priced
      ? {
          blueprintTypeId: 691,
          productTypeId: 587,
          activityId: 1,
          quantityPerRun: 1,
          jobSeconds: 6000,
          inputCost: 380_000,
          jobFee: 20_000,
          incomplete: false,
          drivers: [],
        }
      : null,
  };
  return researchInsight(source, DEFAULT_ASSUMPTIONS);
}

function html<P extends object>(type: FunctionComponent<P>, props: P): string {
  return renderToStaticMarkup(createElement(type, props));
}
const priced = insightFor(days(104));
const unpriced = insightFor(days(104), false);
const empty = insightFor([], false);

describe('chart kit', () => {
  it('formats dates and ticks, and draws legends and meters', () => {
    expect(shortDate('2026-09-28')).toBe('Sep 28');
    expect(iskTick(500_000)).toBe('500.0K');
    expect(iskTick(2_000_000)).toBe('2M');
    const legend = html(ChartLegend, { items: priceLegend(priced) });
    expect(legend).toContain('Breakeven');
    expect(html(ChartLegend, { items: priceLegend(unpriced) })).not.toContain('Breakeven');
    expect(html(MeterBar, { value: 140, color: 'red' })).toContain('width="100"');
    expect(html(MeterBar, { value: 0, color: 'red', track: false })).not.toContain('<rect');
  });
});

describe('price and volume charts', () => {
  it('draws the price, forecast and reference lines once priced', () => {
    const out = html(PriceChart, { insight: priced, width: 600 });
    expect(out).toContain('data-forecast');
    expect(out).toContain('B/E');
    expect(out).toContain('Ask');
    expect(html(PriceChart, { insight: unpriced, width: 600, legend: false })).not.toContain('data-forecast');
    expect(html(PriceChart, { insight: empty, width: 600 })).toContain('No trading history');
  });

  it('draws a bar a day with the 30-day line', () => {
    expect(html(VolumeChart, { insight: priced, width: 600 }).match(/<rect/g)?.length).toBeGreaterThanOrEqual(90);
    expect(html(VolumeChart, { insight: empty, width: 600 })).toBe('');
  });
});

describe('outlook charts', () => {
  it('splits the sale-price curve at breakeven', () => {
    expect(html(ProfitDistribution, { insight: priced, width: 400 })).toContain('chance the sale clears breakeven');
    expect(html(ProfitDistribution, { insight: unpriced, width: 400 })).toContain('Price the build');
  });

  it('lays the confidence out as bars, a waterfall and a dial', () => {
    expect(html(ConfidenceBars, { confidence: priced.confidence, details: { history: 'Traded 30 of 30 days' } })).toContain('Traded 30 of 30 days');
    expect(html(ConfidenceWaterfall, { confidence: priced.confidence, width: 400 })).toContain('Score');
    expect(html(ConfidenceDial, { score: 82, band: 'High' })).toContain('Confidence 82, High');
    expect(html(ConfidenceDial, { score: null, band: null })).toContain('Confidence unknown');
    expect(html(ConfidenceDial, { score: 40, band: 'Low' })).toContain('Low');
  });

  it('splits one unit’s price into costs and what’s left', () => {
    const parts = marginParts(priced, 7.5, 3);
    expect(parts?.map((p) => p.key)).toEqual(['inputs', 'job', 'tax', 'broker', 'net']);
    expect(marginParts(unpriced, 7.5, 3)).toBeNull();
    expect(html(MarginBreakdown, { insight: priced, salesTaxPct: 7.5, brokerFeePct: 3, width: 400 })).toContain('Materials');
    expect(html(MarginBreakdown, { insight: unpriced, salesTaxPct: 7.5, brokerFeePct: 3, width: 400 })).toContain('No build cost');
  });
});

describe('market charts', () => {
  it('draws a spark and weekday bars', () => {
    expect(html(Spark, { insight: priced })).toContain('<circle');
    expect(html(Spark, { insight: empty })).not.toContain('<circle');
    expect(html(WeekdayBars, { index: [1, 1, 1, 1, 1, 1.4, 0.6], width: 280 })).toContain('+40%');
    expect(html(WeekdayBars, { index: null, width: 280 })).toContain('two weeks');
  });

  it('maps every priced product and labels without collisions', () => {
    const out = html(OpportunityMap, { insights: [priced, unpriced], width: 500, selected: 691 });
    expect(out).toContain('Rifter');
    expect(out).toContain('Opportunity map of 1 watched products');
    expect(marginDomain([])).toEqual([-10, 20]);
    expect(marginDomain([35, -2])).toEqual([-10, 40]);
    expect(marginDomain([200])).toEqual([-10, 80]);
    const rows = placeLabels([
      { id: 1, x: 10, y: 50, width: 60 },
      { id: 2, x: 20, y: 52, width: 60 },
      { id: 3, x: 200, y: 51, width: 60 },
    ]);
    expect(rows.get(1)).toBe(50);
    expect(rows.get(2)).toBe(63);
    expect(rows.get(3)).toBe(51);
  });
});
