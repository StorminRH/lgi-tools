import {
  BEST_DUST_VOLUME_DIVISOR,
  DEPTH_BANDS_PCT,
  NPC_STATION_ID_CEILING,
} from './constants';
import type { DepthBand, RegionalDiscount } from './types';

// Pure order-book math for the market-prices slice: the dust-filtered
// best/pct5 walk, the near-touch depth ladder, and the regional-discount
// fold (3.7.26.1). No fetch, no DB — importable by tests and one-off
// diagnosis scripts without dragging in the ESI gate. source.ts re-exports
// the shared pieces so its consumers are unaffected by the extraction.

/** One market order-book entry with price in ISK and remaining volume in units. */
export interface OrderEntry {
  price: number;
  volume: bigint;
}

/**
 * One remote station's sell book, accumulated by the ingest while it scopes
 * the stored book to the hub. Keyed by location id in the bucket map; the
 * system id rides along because it's what the callout stores (system name is
 * the UI's resolution, never station names).
 */
export interface RemoteStationBook {
  systemId: number;
  orders: OrderEntry[];
}

/**
 * Best + 5%-percentile for one side of the book.
 *
 * `best` is the DUST-FILTERED touch (3.7.25.1): the lowest ask / highest bid
 * with real volume behind it. The sorted book is walked front-to-back and the
 * best is the price of the order at which cumulative volume first reaches
 * ceil(side volume / BEST_DUST_VOLUME_DIVISOR) (0.1%, min 1 unit) — so a
 * healthy front order (carrying the threshold alone) keeps the raw touch
 * byte-identically, while a 1-unit sliver anchoring a deep book is skipped.
 * Applies to BOTH sides: on the buy side it filters sliver highball bids the
 * same way (a volume filter, never a pct5 clamp — pct5_buy is wall-diluted
 * and provably wrong as a guard; see the hardening report §2.2).
 *
 * `pct5` — the volume-weighted average price of the cheapest 5% of side
 * volume (Fuzzwork's definition; we match it so wormhole-sites ISK totals
 * don't drift when the source swaps) — is UNTOUCHED by the dust filter and
 * still walks from the raw front of the book. Buy side sorts descending
 * (best bid first); sell side sorts ascending (best ask first). Empty side
 * returns nulls; zero-volume side returns the raw touch for both.
 *
 * Exported for testing — the math is delicate enough that a direct
 * regression test is worth the extra surface.
 */
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

  // Dust-filtered best: ceil-divide in bigint (no float), then take the price
  // of the order that carries cumulative volume across the threshold. The
  // threshold never exceeds totalVolume, so the walk always lands on an order.
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

  // Threshold = ceil(5% of total volume) — bigint math truncates by
  // default, which on small volumes rounds the threshold down to zero;
  // bump up by one when there's any remainder so a single tiny order
  // still gets sampled.
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

/**
 * Near-touch depth ladder (3.5.3a): cumulative volume within each band of
 * DEPTH_BANDS_PCT measured from `best` on this side. One pass, no sort —
 * bands are nested, so an order within the tightest band it qualifies for is
 * counted in that band and every wider one. `best` comes from computeSide;
 * an empty side (best === null) has no depth.
 *
 * Anchored to `best` — the DUST-FILTERED best from computeSide (3.7.25.1),
 * not pct5 and not the raw touch; see DEPTH_BANDS_PCT for the manipulation
 * argument (the hardened anchor closes the mid-gap sliver case, where a
 * 1-unit ask under the real book used to window the bands around itself and
 * exclude the real sell wall). A buy order qualifies for band b when
 * price ≥ best·(1−b/100); a sell order when price ≤ best·(1+b/100). Volume
 * accumulates as a Number, like
 * computeSide's weighted sum (realistic cumulative volumes stay under
 * MAX_SAFE_INTEGER).
 *
 * Exported for testing — the manipulation-resistance is delicate enough that
 * direct adversarial fixtures (a 0.01-ISK spoof, a far-out whale order) are
 * worth the surface.
 */
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
      // `i` indexes the parallel `sums` (same length as DEPTH_BANDS_PCT), always in-bounds.
      if (within) sums[i] = (sums[i] ?? 0) + Number(o.volume);
    }
  }
  return DEPTH_BANDS_PCT.map((pct, i) => ({ pct, cumVolume: sums[i] ?? 0 }));
}

/**
 * Whether a remote sell book may anchor a regional-discount callout: NPC
 * stations only (see NPC_STATION_ID_CEILING — structures can be ACL-gated,
 * and the calibration set had no structure candidates).
 */
export function isDiscountEligibleLocation(locationId: number): boolean {
  return locationId < NPC_STATION_ID_CEILING;
}

/**
 * The regional-discount fold (3.7.26.1): the best single non-hub sell
 * opportunity, computed from the remote books the hub scoping filters out
 * of the stored price. Guards, in order:
 *
 * - No hub best → no discount (the discount is measured against the hub
 *   price; with no hub book there is nothing to compare to — the row is
 *   null-priced and the callout stays silent).
 * - Each remote station's book gets the SAME dust walk as the hub book
 *   (computeSide over the station's FULL book) — a backwater [1,1,1,1,1]
 *   sliver ladder must not fake an opportunity; that is exactly the class
 *   hub scoping just removed from the headline.
 * - A station qualifies only when its dust-filtered best is strictly under
 *   the hub best; its `units` count the station's volume priced at-or-under
 *   the hub best (what a traveler could actually buy cheaper than Jita).
 * - Both gate thresholds must clear (see constants.ts for calibration).
 * - Winner = the lowest surviving station best; ONE opportunity per type,
 *   never a list.
 *
 * `units` is a plain number — this value rides a jsonb column and BigInt
 * throws at JSON serialization.
 */
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

// One station's opportunity against the hub best: its dust-filtered best
// (full-book walk, same semantics as the hub) and the units purchasable
// at-or-under the hub price. Null when the station's real front isn't
// actually cheaper than the hub.
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
