'use client';

import { createContext, useContext } from 'react';
import { isLivePricedResource, liveIskFor } from '../live-isk';
import type { SiteResource } from '../types';
import { NO_LIVE_PRICES, type LivePriceLookup } from './live-price-lookup';

export interface SiteLiveValue extends LivePriceLookup {
  readonly requestEnable: () => void;
}

const NO_LIVE: SiteLiveValue = { ...NO_LIVE_PRICES, requestEnable: () => {} };

export const SiteLiveContext = createContext<SiteLiveValue>(NO_LIVE);

export function useSiteLive(): SiteLiveValue {
  return useContext(SiteLiveContext);
}

export function resourceLiveIsk(resource: SiteResource, live: LivePriceLookup): number | null {
  if (!isLivePricedResource(resource)) return resource.effectiveIsk;
  const refreshed = live.priceOf(resource.typeId);
  return liveIskFor(resource.units, refreshed?.bestSell ?? null) ?? resource.effectiveIsk;
}
