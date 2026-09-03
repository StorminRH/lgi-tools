import type { DepthBand, RegionalDiscount } from './types';

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
