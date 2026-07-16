import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteDetail, SiteResource } from './types';

const h = vi.hoisted(() => ({
  getPrices: vi.fn(),
  getTypesByIds: vi.fn(),
}));

vi.mock('@/data/market-prices/queries', () => ({
  getPrices: h.getPrices,
}));

vi.mock('@/data/eve-data/queries', () => ({
  getTypesByIds: h.getTypesByIds,
}));

import { overlayLivePrices } from './live-prices';

function resource(
  id: number,
  values: Partial<SiteResource> = {},
): SiteResource {
  const base = {
    id,
    orderInSite: id,
    resourceKind: 'gas',
    resourceName: `Resource ${id}`,
    units: 1,
    volumeM3: 1,
    iskPerM3: 1,
    totalIsk: 100,
    typeId: id,
    liveIsk: null,
    liveEligible: false,
    ...values,
  };
  return {
    ...base,
    effectiveIsk: values.effectiveIsk === undefined
      ? base.totalIsk
      : values.effectiveIsk,
  };
}

function site(
  id: number,
  resources: SiteResource[],
  resourceValueIsk = 999,
): SiteDetail {
  return {
    id,
    name: `Site ${id}`,
    siteType: 'gas',
    wormholeClass: null,
    signatureLabel: 'Gas Signature',
    sourceTab: 'Gas',
    blueLootIsk: null,
    iskPerEhp: null,
    resourceValueIsk,
    waves: [],
    resources,
  };
}

beforeEach(() => {
  h.getPrices.mockReset();
  h.getTypesByIds.mockReset();
});

describe('overlayLivePrices', () => {
  it('returns the original input without data reads when no resource has a type ID', async () => {
    const sites = [
      site(1, [resource(1, { typeId: null })]),
      site(2, []),
    ];

    const result = await overlayLivePrices(sites);

    expect(result).toBe(sites);
    expect(h.getPrices).not.toHaveBeenCalled();
    expect(h.getTypesByIds).not.toHaveBeenCalled();
  });

  it('deduplicates reads, applies eligible prices, and recomputes copied site totals', async () => {
    const priced = resource(1, { typeId: 10, units: 2, totalIsk: 100 });
    const noPrice = resource(2, { typeId: 20, units: 3, totalIsk: 200 });
    const noType = resource(3, { typeId: null, totalIsk: 300 });
    const missingSde = resource(4, { typeId: 30, totalIsk: 400 });
    const zeroVolume = resource(5, { typeId: 40, totalIsk: null });
    const nullUnits = resource(6, { typeId: 50, units: null, totalIsk: 500 });
    const zeroUnits = resource(7, { typeId: 60, units: 0, totalIsk: 600 });
    const negativeUnits = resource(8, { typeId: 70, units: -1, totalIsk: 700 });
    const duplicateType = resource(9, { typeId: 10, units: 1, totalIsk: 900 });
    const resourceSite = site(1, [
      priced,
      noPrice,
      noType,
      missingSde,
      zeroVolume,
      nullUnits,
      zeroUnits,
      negativeUnits,
    ]);
    const duplicateSite = site(2, [duplicateType]);
    const emptySite = site(3, [], 321);
    const sites = [resourceSite, duplicateSite, emptySite];
    const original = structuredClone(sites);

    h.getPrices.mockResolvedValue(new Map([
      [10, { pct5Buy: 5.5 }],
    ]));
    h.getTypesByIds.mockResolvedValue([
      { id: 10, volume: 1 },
      { id: 20, volume: 1 },
      { id: 40, volume: 0 },
      { id: 50, volume: 1 },
      { id: 60, volume: 1 },
      { id: 70, volume: 1 },
    ]);

    const result = await overlayLivePrices(sites);

    const expectedTypeIds = [10, 20, 30, 40, 50, 60, 70];
    expect(h.getPrices).toHaveBeenCalledWith(expectedTypeIds);
    expect(h.getTypesByIds).toHaveBeenCalledWith(expectedTypeIds);
    expect(h.getPrices).toHaveBeenCalledTimes(1);
    expect(h.getTypesByIds).toHaveBeenCalledTimes(1);

    expect(result).not.toBe(sites);
    expect(result[0]).not.toBe(resourceSite);
    expect(result[0]?.resources[0]).not.toBe(priced);
    expect(result[2]).toBe(emptySite);
    expect(sites).toEqual(original);

    expect(result[0]?.resources).toEqual([
      { ...priced, liveIsk: 11, effectiveIsk: 11, liveEligible: true },
      { ...noPrice, liveIsk: null, effectiveIsk: 200, liveEligible: true },
      { ...noType, liveIsk: null, effectiveIsk: 300, liveEligible: false },
      { ...missingSde, liveIsk: null, effectiveIsk: 400, liveEligible: false },
      { ...zeroVolume, liveIsk: null, effectiveIsk: null, liveEligible: false },
      { ...nullUnits, liveIsk: null, effectiveIsk: 500, liveEligible: false },
      { ...zeroUnits, liveIsk: null, effectiveIsk: 600, liveEligible: false },
      { ...negativeUnits, liveIsk: null, effectiveIsk: 700, liveEligible: false },
    ]);
    expect(result[0]?.resourceValueIsk).toBe(2_711);
    expect(result[1]?.resources).toEqual([
      { ...duplicateType, liveIsk: 6, effectiveIsk: 6, liveEligible: true },
    ]);
    expect(result[1]?.resourceValueIsk).toBe(6);
    expect(result[2]?.resourceValueIsk).toBe(321);
  });
});
