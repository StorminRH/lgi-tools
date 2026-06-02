'use client';

import { createContext, useContext } from 'react';
import type { RefreshedPrice } from '@/data/market-prices/use-refresh-on-view';
import { liveIskFor } from '../live-isk';
import type { SiteResource } from '../types';

// Shared live-price context for a site's resource rows + footer. Its own module
// so the island (provider) and ResourceRow (consumer) don't import each other.

export interface SiteLiveValue {
  priceOf: (typeId: number) => RefreshedPrice | undefined;
  isPending: (typeId: number) => boolean;
  everPending: boolean;
}

const NO_LIVE: SiteLiveValue = {
  priceOf: () => undefined,
  isPending: () => false,
  everPending: false,
};

export const SiteLiveContext = createContext<SiteLiveValue>(NO_LIVE);

// Rows fall back to their static seed outside a provider (no badge, no flash).
export function useSiteLive(): SiteLiveValue {
  return useContext(SiteLiveContext);
}

// The live ISK for an eligible resource given the current price map, or its
// static seed when no live value has landed (or it isn't eligible).
export function resourceLiveIsk(resource: SiteResource, live: SiteLiveValue): number | null {
  if (!resource.liveEligible || resource.typeId == null) return resource.effectiveIsk;
  const refreshed = live.priceOf(resource.typeId);
  return liveIskFor(resource.units, refreshed?.pct5Buy ?? null) ?? resource.effectiveIsk;
}
