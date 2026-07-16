import type { RefreshedPrice } from '@/data/market-prices/use-refresh-on-view';
import type { PriceLite } from './build-pricing';
import { initialPriceMap } from './initial-price-map';
import type { BlueprintPricing } from './types';

interface PriceSeedSettlement {
  seeded: true;
  settle: (current: BlueprintPricing | null) => BlueprintPricing | null;
}

export interface PriceSnapshot {
  seed: (initial: BlueprintPricing | null) => PriceSeedSettlement;
  applyBatch: (batch: Map<number, RefreshedPrice>) => void;
  lookup: (typeId: number) => PriceLite | undefined;
}

// Owns the client price-store merge policy behind one lookup: the streamed seed
// is captured once, each refresh callback replaces the cumulative live snapshot,
// and live values win per type while untouched rows keep their server fallback.
export function createPriceSnapshot(): PriceSnapshot {
  let captured = false;
  let initialPricing: BlueprintPricing | null = null;
  let seedPrices = new Map<number, PriceLite>();
  let livePrices = new Map<number, RefreshedPrice>();

  return {
    seed(initial) {
      if (!captured) {
        captured = true;
        initialPricing = initial;
        if (initial !== null) seedPrices = initialPriceMap(initial);
      }
      return {
        seeded: true,
        // A refresh/recompute may have advanced the reactive snapshot before
        // the streamed seed settles. The late seed never clobbers that winner.
        settle: (current) => current ?? initialPricing,
      };
    },
    applyBatch(batch) {
      // useRefreshOnView reports a cumulative snapshot after each batch, so the
      // latest callback is authoritative rather than something to merge again.
      livePrices = batch;
    },
    lookup(typeId) {
      return livePrices.get(typeId) ?? seedPrices.get(typeId);
    },
  };
}
