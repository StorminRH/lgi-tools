import { describe, expect, it } from 'vitest';
import type { RefreshedPrice } from '@/data/market-prices/use-refresh-on-view';
import type { SiteResource } from '../types';
import { resourceLiveIsk, type SiteLiveValue } from './site-live-context';

function resource(overrides: Partial<SiteResource>): SiteResource {
  return {
    id: 1,
    orderInSite: 0,
    resourceKind: 'ore',
    resourceName: 'Arkonor',
    units: 1000,
    volumeM3: null,
    iskPerM3: null,
    totalIsk: null,
    typeId: 22,
    liveIsk: null,
    effectiveIsk: 5000,
    liveEligible: true,
    ...overrides,
  };
}

function live(pct5Buy: number | null): SiteLiveValue {
  return {
    priceOf: () => (pct5Buy === null ? undefined : ({ pct5Buy } as RefreshedPrice)),
    isPending: () => false,
    requestEnable: () => {},
  };
}

describe('resourceLiveIsk', () => {
  it('uses live buy when eligible, otherwise the static seed', () => {
    expect(resourceLiveIsk(resource({ liveEligible: false }), live(3))).toBe(5000);
    expect(resourceLiveIsk(resource({ typeId: null }), live(3))).toBe(5000);
    expect(resourceLiveIsk(resource({}), live(null))).toBe(5000);
    expect(resourceLiveIsk(resource({ units: 1000 }), live(3))).toBe(3000);
    expect(resourceLiveIsk(resource({ units: 1000 }), live(0))).toBe(5000);
    expect(resourceLiveIsk(resource({ units: 0 }), live(3))).toBe(5000);
  });
});
