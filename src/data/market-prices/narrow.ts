import type { DepthBand, RegionalDiscount } from './types';

/**
 * Narrow a priced row's transport-typed figures to the plain-number client
 * shape. Volumes arrive as DB bigints (the planner's server seed) or wire
 * strings (the live-refresh response) — Number() narrows both — and
 * regionalDiscount may be absent on payloads predating the field (3.7.26.1),
 * normalized to null here. One field list shared by both deserializers so a
 * new figure can't land on one path and miss the other.
 */
export function toPlainPriceFigures(p: {
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  buyVolume: bigint | string | null;
  sellVolume: bigint | string | null;
  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;
  regionalDiscount?: RegionalDiscount | null;
}) {
  return {
    bestBuy: p.bestBuy,
    bestSell: p.bestSell,
    pct5Buy: p.pct5Buy,
    pct5Sell: p.pct5Sell,
    buyVolume: p.buyVolume === null ? null : Number(p.buyVolume),
    sellVolume: p.sellVolume === null ? null : Number(p.sellVolume),
    buyDepth: p.buyDepth,
    sellDepth: p.sellDepth,
    regionalDiscount: p.regionalDiscount ?? null,
  };
}
