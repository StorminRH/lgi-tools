import {
  BEST_DUST_VOLUME_DIVISOR,
  BUY_SPREAD_FLOOR_RATIO,
  DEPTH_BANDS_PCT,
  NPC_STATION_ID_CEILING,
} from './constants';
import type { DepthBand, RegionalDiscount } from './types';

export interface OrderEntry {
  price: number;
  volume: bigint;
}

function spreadFloorIsk(bestSell: number | null): number | null {
  if (bestSell === null || bestSell <= 0) return null;
  return bestSell * BUY_SPREAD_FLOOR_RATIO;
}

export function filterBuyOrdersBelowSpreadFloor(
  buyOrders: OrderEntry[],
  bestSell: number | null,
): OrderEntry[] {
  const floor = spreadFloorIsk(bestSell);
  if (floor === null) return buyOrders;
  return buyOrders.filter((order) => order.price >= floor);
}

export function applySpreadFloorToBuyFigures(
  figures: {
    bestBuy: number | null;
    pct5Buy: number | null;
    buyVolume: bigint | null;
  },
  bestSell: number | null,
): {
  bestBuy: number | null;
  pct5Buy: number | null;
  buyVolume: bigint | null;
} {
  const floor = spreadFloorIsk(bestSell);
  if (floor === null) return figures;
  if (figures.bestBuy !== null && figures.bestBuy < floor) {
    return { bestBuy: null, pct5Buy: null, buyVolume: null };
  }
  if (figures.pct5Buy !== null && figures.pct5Buy < floor) {
    return { ...figures, pct5Buy: null };
  }
  return figures;
}

export interface RemoteStationBook {
  systemId: number;
  orders: OrderEntry[];
}

export function computeSide(
  orders: OrderEntry[],
  direction: 'asc' | 'desc',
): { best: number | null; pct5: number | null; volume: bigint | null } {
  const sorted = [...orders].sort((a, b) =>
    direction === 'asc' ? a.price - b.price : b.price - a.price,
  );
  const front = sorted[0];
  if (front === undefined) {
    return { best: null, pct5: null, volume: null };
  }

  let totalVolume = BigInt(0);
  for (const o of sorted) totalVolume += o.volume;
  if (totalVolume === BigInt(0)) {
    return { best: front.price, pct5: front.price, volume: BigInt(0) };
  }

  const dustThreshold =
    (totalVolume + BEST_DUST_VOLUME_DIVISOR - BigInt(1)) / BEST_DUST_VOLUME_DIVISOR;
  let best = front.price;
  let cumulative = BigInt(0);
  for (const o of sorted) {
    cumulative += o.volume;
    if (cumulative >= dustThreshold) {
      best = o.price;
      break;
    }
  }

  const fivePct = totalVolume * BigInt(5);
  const threshold =
    fivePct % BigInt(100) === BigInt(0)
      ? fivePct / BigInt(100)
      : fivePct / BigInt(100) + BigInt(1);

  let used = BigInt(0);
  let weightedSum = 0;
  for (const o of sorted) {
    const remaining = threshold - used;
    if (remaining <= BigInt(0)) break;
    const take = o.volume < remaining ? o.volume : remaining;
    weightedSum += o.price * Number(take);
    used += take;
  }
  const pct5 = used > BigInt(0) ? weightedSum / Number(used) : best;
  return { best, pct5, volume: totalVolume };
}

export function computeDepth(
  orders: OrderEntry[],
  direction: 'asc' | 'desc',
  best: number | null,
): DepthBand[] | null {
  if (best === null || orders.length === 0) return null;
  const sums = DEPTH_BANDS_PCT.map(() => 0);
  for (const o of orders) {
    for (const [i, band] of DEPTH_BANDS_PCT.entries()) {
      const within =
        direction === 'desc'
          ? o.price >= best * (1 - band / 100)
          : o.price <= best * (1 + band / 100);
      if (within) sums[i] = (sums[i] ?? 0) + Number(o.volume);
    }
  }
  return DEPTH_BANDS_PCT.map((pct, i) => ({ pct, cumVolume: sums[i] ?? 0 }));
}

export function isDiscountEligibleLocation(locationId: number): boolean {
  return locationId < NPC_STATION_ID_CEILING;
}

export function computeRegionalDiscount(
  remoteSell: Map<number, RemoteStationBook>,
  hubBestSell: number | null,
  gate: { minPct: number; minUnits: number },
): RegionalDiscount | null {
  if (hubBestSell == null) return null;
  let winner: RegionalDiscount | null = null;
  for (const book of remoteSell.values()) {
    const opp = stationOpportunity(book, hubBestSell);
    if (opp === null || opp.pct < gate.minPct || opp.units < gate.minUnits) continue;
    if (winner === null || opp.price < winner.price) winner = opp;
  }
  return winner;
}

function stationOpportunity(
  book: RemoteStationBook,
  hubBestSell: number,
): RegionalDiscount | null {
  const { best } = computeSide(book.orders, 'asc');
  if (best === null || best >= hubBestSell) return null;
  let units = 0;
  for (const o of book.orders) {
    if (o.price <= hubBestSell) units += Number(o.volume);
  }
  return {
    systemId: book.systemId,
    price: best,
    units,
    pct: ((hubBestSell - best) / hubBestSell) * 100,
  };
}
