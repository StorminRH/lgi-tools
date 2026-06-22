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
