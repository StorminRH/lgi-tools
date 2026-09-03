export interface DepthBand {
  pct: number;
  cumVolume: number;
}

export interface RegionalDiscount {
  systemId: number;
  price: number;
  units: number;
  pct: number;
}

export interface PricedFigures {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;

  buyVolume: bigint | null;
  sellVolume: bigint | null;

  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;

  regionalDiscount: RegionalDiscount | null;

  source: PriceSource;
}

export interface MarketPrice extends PricedFigures {
  updatedAt: Date;

  staleAfter: Date;
}

export type PriceSource = 'esi' | 'fuzzwork-fallback' | 'fuzzwork';

export type RawMarketPrice = PricedFigures;
