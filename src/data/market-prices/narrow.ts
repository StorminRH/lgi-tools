import type { PlainPriceFigures, PriceFigures, PriceSource, RegionalDiscount } from './types';

/**
 * One price as the browser and the planner hold it: volumes from a stored
 * (bigint) or wire (string) row as plain numbers, and the stale time in epoch
 * ms, or null for a stored row with no expiry. Wire rows from before 3.7.26.1
 * carry no regionalDiscount; it reads null.
 */
export function toClientPrice<S extends number | null>(
  p: Omit<PriceFigures<bigint | string>, 'regionalDiscount'> & {
    regionalDiscount?: RegionalDiscount | null;
    source: PriceSource;
  },
  staleAfterMs: S,
): PlainPriceFigures & { source: PriceSource; staleAfterMs: S } {
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
    source: p.source,
    staleAfterMs,
  };
}
