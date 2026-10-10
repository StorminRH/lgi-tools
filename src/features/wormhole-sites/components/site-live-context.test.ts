import { describe, expect, it } from 'vitest';
import type { RefreshedPrice } from '@/data/market-prices/use-refresh-on-view';
import { siteResource } from '../__tests__/site-fixtures';
import type { SiteResource } from '../types';
import { resourceLiveIsk, type SiteLiveValue } from './site-live-context';

/** A live-eligible resource whose static seed is 5000 ISK while liveIsk and totalIsk are null. */
const seeded = (over: Partial<SiteResource>): SiteResource =>
  siteResource({ typeId: 22, units: 1000, liveEligible: true, effectiveIsk: 5000, ...over });

function live(bestSell: number | null): SiteLiveValue {
  return {
    priceOf: () => (bestSell === null ? undefined : ({ bestSell } as RefreshedPrice)),
    isPending: () => false,
    requestEnable: () => {},
  };
}

describe('resourceLiveIsk', () => {
  it('uses live best-sell when eligible, otherwise the static seed', () => {
    expect(resourceLiveIsk(seeded({ liveEligible: false }), live(3))).toBe(5000);
    expect(resourceLiveIsk(seeded({ typeId: null }), live(3))).toBe(5000);
    expect(resourceLiveIsk(seeded({}), live(null))).toBe(5000);
    expect(resourceLiveIsk(seeded({ units: 1000 }), live(3))).toBe(3000);
    expect(resourceLiveIsk(seeded({ units: 1000 }), live(0))).toBe(5000);
    expect(resourceLiveIsk(seeded({ units: 0 }), live(3))).toBe(5000);
  });
});
