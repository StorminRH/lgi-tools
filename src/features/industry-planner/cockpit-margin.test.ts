import { describe, expect, it } from 'vitest';
import { selectNet } from './cockpit-margin';
import type { BlueprintPricing, NetMarginView } from './types';

// Minimal fixtures — selectNet reads only `.net`.
const netView = (netCost: number) => ({ netCost }) as unknown as NetMarginView;
const pricingWith = (net: NetMarginView | null) => ({ net }) as unknown as BlueprintPricing;

describe('selectNet', () => {
  it('returns net for a manufacturing blueprint with a location in net mode', () => {
    const nv = netView(120);
    const { net, netAvailable } = selectNet(pricingWith(nv), 1, true, 'net');
    expect(netAvailable).toBe(true);
    expect(net).toBe(nv);
  });

  it('returns net for a reaction blueprint with a reaction fee source (3.7.13.3)', () => {
    const nv = netView(120);
    const { net, netAvailable } = selectNet(pricingWith(nv), 11, true, 'net');
    expect(netAvailable).toBe(true);
    expect(net).toBe(nv);
  });

  it('is unavailable for a reaction blueprint without a reaction fee source', () => {
    const { net, netAvailable } = selectNet(pricingWith(netView(120)), 11, false, 'net');
    expect(netAvailable).toBe(false);
    expect(net).toBeNull();
  });

  it('is unavailable for a non-feeable activity even with a fee source', () => {
    // e.g. invention (8) — the fee path covers manufacturing + reactions only.
    const { net, netAvailable } = selectNet(pricingWith(netView(120)), 8, true, 'net');
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
