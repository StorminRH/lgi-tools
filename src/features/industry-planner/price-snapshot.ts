import type { RefreshedPrice } from '@/data/market-prices/use-refresh-on-view';
import type { PriceLite } from './build-pricing';
import { initialPriceMap } from './initial-price-map';
import type { BlueprintPricing } from './types';

export interface PriceSeedSettlement {
  seeded: true;
  settle: (current: BlueprintPricing | null) => BlueprintPricing | null;
}

export interface PriceSnapshot {
  seed: (initial: BlueprintPricing | null) => PriceSeedSettlement;
  applyBatch: (batch: Map<number, RefreshedPrice>) => void;
  lookup: (typeId: number) => PriceLite | undefined;
}

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
        settle: (current) => current ?? initialPricing,
      };
    },
    applyBatch(batch) {
      livePrices = batch;
    },
    lookup(typeId) {
      return livePrices.get(typeId) ?? seedPrices.get(typeId);
    },
  };
}
