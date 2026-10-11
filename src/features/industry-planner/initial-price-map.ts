import type { PriceLite } from './build-pricing';
import type { BlueprintPricing, RowPriceFields } from './types';

/** A material or intermediate row's prices, mapped field by field so no row column reaches the map. */
function seedPrice(bestBuy: number | null, row: RowPriceFields): PriceLite {
  return {
    bestBuy,
    bestSell: row.bestSell,
    pct5Buy: row.pct5Buy,
    pct5Sell: row.pct5Sell,
    buyVolume: row.buyVolume,
    sellVolume: row.sellVolume,
    buyDepth: null,
    sellDepth: null,
    source: row.source,
    staleAfterMs: row.staleAfterMs,
  };
}

export function initialPriceMap(pricing: BlueprintPricing): Map<number, PriceLite> {
  const map = new Map<number, PriceLite>();
  // A material row's buy quote is its unitBuy. Intermediates go second, so
  // their own bestBuy wins for a typeId that is both.
  for (const r of pricing.rows) map.set(r.typeId, seedPrice(r.unitBuy, r));
  for (const ip of pricing.intermediatePrices) map.set(ip.typeId, seedPrice(ip.bestBuy, ip));
  map.set(pricing.product.typeId, {
    bestBuy: map.get(pricing.product.typeId)?.bestBuy ?? null,
    bestSell: pricing.product.bestSell,
    pct5Buy: null,
    pct5Sell: pricing.product.pct5Sell,
    buyVolume: null,
    sellVolume: null,
    buyDepth: pricing.product.buyDepth,
    sellDepth: pricing.product.sellDepth,
    regionalDiscount: pricing.product.regionalDiscount ?? null,
    source: null,
    staleAfterMs: pricing.product.staleAfterMs,
  });
  return map;
}
