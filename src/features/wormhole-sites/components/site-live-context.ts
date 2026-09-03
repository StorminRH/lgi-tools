'use client';

import { createContext, useContext } from 'react';
import type { RefreshedPrice } from '@/data/market-prices/use-refresh-on-view';
import { liveIskFor } from '../live-isk';
import type { SiteResource } from '../types';

export interface SiteLiveValue {
  priceOf: (typeId: number) => RefreshedPrice | undefined;
  isPending: (typeId: number) => boolean;
  requestEnable: () => void;
}

const NO_LIVE: SiteLiveValue = {
  priceOf: () => undefined,
  isPending: () => false,
  requestEnable: () => {},
};

export const SiteLiveContext = createContext<SiteLiveValue>(NO_LIVE);

export function useSiteLive(): SiteLiveValue {
  return useContext(SiteLiveContext);
}

export function resourceLiveIsk(resource: SiteResource, live: SiteLiveValue): number | null {
  if (!resource.liveEligible || resource.typeId == null) return resource.effectiveIsk;
  const refreshed = live.priceOf(resource.typeId);
  return liveIskFor(resource.units, refreshed?.bestSell ?? null) ?? resource.effectiveIsk;
}
