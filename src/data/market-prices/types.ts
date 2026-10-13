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

/** One type's price figures, with its order volumes held as V. */
export interface PriceFigures<V> {
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  buyVolume: V | null;
  sellVolume: V | null;
  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;
  regionalDiscount: RegionalDiscount | null;
}

/** The figures with plain-number volumes, as the browser and the planner hold them. */
export type PlainPriceFigures = PriceFigures<number>;

export interface PricedFigures extends PriceFigures<bigint> {
  typeId: number;
  source: PriceSource;
}

export interface MarketPrice extends PricedFigures {
  updatedAt: Date;
  /** CCP's expiry as the row was written; null once the column is retired. The response store decides freshness. */
  staleAfter: Date | null;
}

export type PriceSource = 'esi' | 'fuzzwork-fallback' | 'fuzzwork';

export type RawMarketPrice = PricedFigures;
