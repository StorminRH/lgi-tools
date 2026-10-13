'use client';

import { useMemo } from 'react';
import {
  useRefreshOnView,
  type RefreshedPrice,
} from '@/data/market-prices/use-refresh-on-view';

/** The live prices a provider refreshed for its type ids, and which ids are still loading. */
export interface LivePriceLookup {
  readonly priceOf: (typeId: number) => RefreshedPrice | undefined;
  readonly isPending: (typeId: number) => boolean;
}

/** Outside a provider: nothing is priced and nothing is pending. */
export const NO_LIVE_PRICES: LivePriceLookup = {
  priceOf: () => undefined,
  isPending: () => false,
};

export function useLivePriceLookup(
  typeIds: number[],
  opts: { enabled: boolean; refreshKey?: string },
): LivePriceLookup {
  const { prices, isPending } = useRefreshOnView(typeIds, opts);
  return useMemo<LivePriceLookup>(
    () => ({ priceOf: (typeId) => prices.get(typeId), isPending }),
    [prices, isPending],
  );
}
