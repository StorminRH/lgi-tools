import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { ComponentJobFees, NetMarginView } from '../types';
import { FeeBreakdownPanel } from './FeeBreakdownPanel';

const fee = (total: number | null, missingAdjustedPriceTypeIds: number[] = []) => ({
  estimatedItemValue: 1_000,
  jobGrossCost: total,
  facilityTax: 2.5,
  sccSurcharge: 40,
  total,
  missingSystemCostIndex: total === null,
  missingAdjustedPriceTypeIds,
});

const job = (typeId: number, total: number | null, missingAdjustedPriceTypeIds: number[] = []) => ({
  typeId,
  blueprintTypeId: typeId + 100,
  reaction: false,
  runs: 1,
  systemId: 1,
  systemCostIndex: 0.01,
  facilityTaxRate: 0.0025,
  fee: fee(total, missingAdjustedPriceTypeIds),
});

const net = (componentJobs: ComponentJobFees | null): NetMarginView => ({
  netMargin: 0,
  netMarginPct: 0,
  netCost: 0,
  systemCostIndex: 0.1283,
  facilityTaxRate: 0.0025,
  facilityTaxAssumed: true,
  jobFee: { ...fee(24_800), jobGrossCost: 18_500, facilityTax: 372, sccSurcharge: 5_928 },
  sellSide: { salesTax: 27_800, brokerFee: 11_100, total: 38_900 },
  componentJobs,
});

const NAMES: Record<number, string> = { 10: 'Oscillator Capacitor Unit', 20: 'Fernite Carbide' };
const render = (view: NetMarginView, systemName: string | undefined) =>
  renderToStaticMarkup(
    createElement(FeeBreakdownPanel, { net: view, systemName, nameOf: (typeId: number) => NAMES[typeId] ?? `Type ${typeId}` }),
  );

const headlines = (html: string) =>
  [...html.matchAll(/<summary[^>]*>(.*?)<\/summary>/g)].map(([, inner]) => inner!.replace(/<[^>]+>/g, '').replace('▾', '').trim());

test('each kind of fee is one closed headline with its total', () => {
  const html = render(net({ jobs: [job(20, 58.35), job(10, 7_800)], total: 7_858.35 }), 'Amamake');
  expect(headlines(html)).toEqual(['Final job· Amamake24.8K', 'Component jobs · 27.9K', 'Sell fees38.9K']);
  expect(html.match(/<details/g)).toHaveLength(3);
  expect(html).not.toMatch(/<details[^>]*\sopen/);
});

test('opening a headline lists what makes it up, the dearest component job first', () => {
  const html = render(net({ jobs: [job(20, 58.35), job(10, 7_800)], total: 7_858.35 }), 'Amamake');
  const sections = html.split('<details').slice(1);
  expect(sections[0]).toContain('System cost (12.83%)');
  expect(sections[0]).toContain('Facility tax (0.25% assumed)');
  expect(sections[0]).toContain('SCC surcharge');
  expect(sections[1]!.indexOf('Oscillator Capacitor Unit')).toBeLessThan(sections[1]!.indexOf('Fernite Carbide'));
  expect(sections[2]).toContain('Sales tax');
  expect(sections[2]).toContain('Broker fee');
});

test('with nothing built below the product there is one install fee and no component jobs', () => {
  const html = render(net(null), undefined);
  expect(headlines(html)).toEqual(['Install fee24.8K', 'Sell fees38.9K']);
});

test('a total that cannot be priced reads as a dash', () => {
  const html = render(net({ jobs: [job(10, null)], total: null }), 'Amamake');
  expect(headlines(html)[1]).toBe('Component jobs · 1—');
});

test('a fee that counts an unpriced input as nothing is amber, and opening it names the input', () => {
  const html = render(net({ jobs: [job(10, 7_800), job(20, 315.64, [34])], total: 8_115.64 }), 'Amamake');
  const sections = html.split('<details').slice(1);
  expect(sections[0]).not.toContain('text-dps-mid');
  expect(sections[1]).toMatch(/<summary[^>]*>.*text-dps-mid[^>]*>8\.1K<\/span><\/summary>/);
  expect(sections[1]).toMatch(/text-dps-mid[^>]*>315\.64</);
  expect(sections[1]).toContain('Price Unavailable · Type 34');
});

test("the product's own unpriced inputs mark the final job", () => {
  const view = net(null);
  view.jobFee.missingAdjustedPriceTypeIds = [20];
  const html = render(view, 'Amamake');
  const finalJob = html.split('<details')[1]!;
  expect(finalJob).toMatch(/<summary[^>]*>.*text-dps-mid[^>]*>24\.8K<\/span><\/summary>/);
  expect(finalJob).toContain('Price Unavailable · Fernite Carbide');
});
