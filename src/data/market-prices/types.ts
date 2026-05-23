// Public-facing record returned by getPrices() and stored in the DB.
// All four price columns are nullable: NULL means "no orders on that
// side at the time of the last refresh."
export interface MarketPrice {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  updatedAt: Date;
}

// Source-shaped record before persistence. Identical to MarketPrice
// minus updatedAt — that timestamp belongs to the ingest layer.
export interface RawMarketPrice {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
}
