import {
  BLUEPRINT_CATEGORY_ID,
  EXCLUDED_LOCATION_FLAGS,
  IMPLANT_LOCATION_FLAG,
  JITA_SPREAD_FLOOR_RATIO,
  PLEX_TYPE_ID,
  SKIN_CATEGORY_ID,
} from './constants';

export interface UnitPrices {
  /** Mean of the Jita 5% buy and sell percentiles, one side when only one exists; null when the spread is junk. */
  jitaMid: number | null;
  /** The Jita sell side on its own, the last resort when the mid is junk and CCP has no average. */
  jitaSell: number | null;
  /** CCP's rolling average from /markets/prices. */
  average: number | null;
}

export type PriceBook = ReadonlyMap<number, UnitPrices>;

/** typeId → SDE category id, for the blueprint and SKIN exclusions. */
export type TypeCategories = ReadonlyMap<number, number>;

export interface AssetLine {
  typeId: number;
  quantity: number;
  locationFlag: string;
}

export interface OpenOrder {
  typeId: number;
  volumeRemain: number;
  isBuyOrder: boolean;
  escrow: number;
}

export interface ValuationInput {
  wallet: number;
  assets: readonly AssetLine[];
  activeImplants: readonly number[];
  jumpCloneImplants: readonly (readonly number[])[];
  orders: readonly OpenOrder[];
}

export interface NetWorthBreakdown {
  total: number;
  liquid: number;
  assets: number;
  sellOrders: number;
  buyEscrow: number;
  implants: number;
  /** Asset, order and implant lines valued at 0 because no price is stored yet. */
  unpriced: number;
}

export interface BookSides {
  pct5Buy: number | null;
  pct5Sell: number | null;
  bestBuy: number | null;
  bestSell: number | null;
}

/** The 5% percentiles when either exists, else the best prices. */
function bookSides(book: BookSides): { buy: number | null; sell: number | null } {
  if (book.pct5Buy !== null || book.pct5Sell !== null) return { buy: book.pct5Buy, sell: book.pct5Sell };
  return { buy: book.bestBuy, sell: book.bestSell };
}

export function jitaMid(book: BookSides): number | null {
  const { buy, sell } = bookSides(book);
  if (buy === null || sell === null) return buy ?? sell;
  return buy < sell * JITA_SPREAD_FLOOR_RATIO ? null : (buy + sell) / 2;
}

export function jitaSell(book: BookSides): number | null {
  return bookSides(book).sell;
}

/**
 * min(Jita mid, CCP average) guards thin Jita books; a junk spread drops the mid so the average
 * stands alone, and the bare sell side is the last resort. PLEX has no Jita book and always takes the average.
 */
export function unitValue(typeId: number, prices: UnitPrices | undefined): number | null {
  if (prices === undefined) return null;
  if (typeId === PLEX_TYPE_ID) return prices.average;
  if (prices.jitaMid !== null && prices.average !== null) return Math.min(prices.jitaMid, prices.average);
  return prices.jitaMid ?? prices.average ?? prices.jitaSell;
}

function roundIsk(value: number): number {
  return Math.round(value * 100) / 100;
}

function isExcludedAsset(line: AssetLine, categories: TypeCategories): boolean {
  const category = categories.get(line.typeId);
  return (
    category === BLUEPRINT_CATEGORY_ID ||
    category === SKIN_CATEGORY_ID ||
    EXCLUDED_LOCATION_FLAGS.includes(line.locationFlag)
  );
}

class Tally {
  sum = 0;
  unpriced = 0;

  add(typeId: number, quantity: number, prices: PriceBook): void {
    const unit = unitValue(typeId, prices.get(typeId));
    if (unit === null) {
      this.unpriced += 1;
      return;
    }
    this.sum += unit * quantity;
  }
}

/**
 * Plugged implants are not listed by the character assets endpoint (no local asset row has ever carried the
 * Implant flag), so the active clone is added from the implants section; any type that does appear as an
 * Implant-flagged asset row is skipped there so it is never counted twice.
 */
function implantTypeIds(input: ValuationInput): number[] {
  const inAssets = new Set(
    input.assets.filter((line) => line.locationFlag === IMPLANT_LOCATION_FLAG).map((line) => line.typeId),
  );
  return [
    ...input.activeImplants.filter((typeId) => !inAssets.has(typeId)),
    ...input.jumpCloneImplants.flat(),
  ];
}

export function valueCharacter(
  input: ValuationInput,
  prices: PriceBook,
  categories: TypeCategories,
): NetWorthBreakdown {
  const assets = new Tally();
  for (const line of input.assets) {
    if (!isExcludedAsset(line, categories)) assets.add(line.typeId, line.quantity, prices);
  }

  const implants = new Tally();
  for (const typeId of implantTypeIds(input)) implants.add(typeId, 1, prices);

  const sellOrders = new Tally();
  let buyEscrow = 0;
  for (const order of input.orders) {
    if (order.isBuyOrder) buyEscrow += order.escrow;
    else sellOrders.add(order.typeId, order.volumeRemain, prices);
  }

  const liquid = roundIsk(input.wallet);
  const breakdown = {
    liquid,
    assets: roundIsk(assets.sum),
    sellOrders: roundIsk(sellOrders.sum),
    buyEscrow: roundIsk(buyEscrow),
    implants: roundIsk(implants.sum),
  };
  return {
    total: roundIsk(
      breakdown.liquid + breakdown.assets + breakdown.sellOrders + breakdown.buyEscrow + breakdown.implants,
    ),
    ...breakdown,
    unpriced: assets.unpriced + implants.unpriced + sellOrders.unpriced,
  };
}
