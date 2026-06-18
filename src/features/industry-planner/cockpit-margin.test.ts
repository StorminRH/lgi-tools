import { describe, expect, it } from 'vitest';
import { deriveLedger, selectNet } from './cockpit-margin';
import type { BlueprintPricing, NetMarginView } from './types';

// Minimal fixtures — selectNet reads only `.net`; deriveLedger reads only
// `summary.{inputCost,revenue}` and `net.netCost`.
const netView = (netCost: number) => ({ netCost }) as unknown as NetMarginView;
const pricingWith = (net: NetMarginView | null) => ({ net }) as unknown as BlueprintPricing;
const summaryWith = (inputCost: number, revenue: number | null) =>
  ({ inputCost, revenue }) as unknown as BlueprintPricing['summary'];

describe('selectNet', () => {
  it('returns net for a manufacturing blueprint with a location in net mode', () => {
    const nv = netView(120);
    const { net, netAvailable } = selectNet(pricingWith(nv), 1, true, 'net');
    expect(netAvailable).toBe(true);
    expect(net).toBe(nv);
  });

  it('is unavailable for a reaction blueprint', () => {
    const { net, netAvailable } = selectNet(pricingWith(netView(120)), 11, true, 'net');
    expect(netAvailable).toBe(false);
    expect(net).toBeNull();
  });

  it('is unavailable with no build location', () => {
    const { net, netAvailable } = selectNet(pricingWith(netView(120)), 1, false, 'net');
    expect(netAvailable).toBe(false);
    expect(net).toBeNull();
  });

  it('returns null net in gross mode even when net is available', () => {
    const { net, netAvailable } = selectNet(pricingWith(netView(120)), 1, true, 'gross');
    expect(netAvailable).toBe(true);
    expect(net).toBeNull();
  });
});

describe('deriveLedger', () => {
  it('uses net cost and computes pre-sell-fee profit', () => {
    const r = deriveLedger(summaryWith(118, 156), netView(121));
    expect(r.cost).toBe(121);
    expect(r.revenue).toBe(156);
    expect(r.profit).toBe(35); // pre-sell-fee: revenue − net cost
    expect(r.costPct).toBe(78); // round(121 / 156)
  });

  it('falls back to input cost when net is null (gross)', () => {
    const r = deriveLedger(summaryWith(118, 156), null);
    expect(r.cost).toBe(118);
    expect(r.profit).toBe(38);
  });

  it('clamps costPct to 100 when cost exceeds revenue', () => {
    expect(deriveLedger(summaryWith(200, 150), null).costPct).toBe(100);
  });

  it('returns null figures and 0% when revenue is unknown', () => {
    const r = deriveLedger(summaryWith(118, null), null);
    expect(r.revenue).toBeNull();
    expect(r.profit).toBeNull();
    expect(r.costPct).toBe(0);
  });

  it('returns null cost when there is no summary', () => {
    const r = deriveLedger(null, null);
    expect(r.cost).toBeNull();
    expect(r.profit).toBeNull();
  });
});
