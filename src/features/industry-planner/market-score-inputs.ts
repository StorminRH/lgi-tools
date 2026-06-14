import type { MarketScoreInputs } from '@/data/industry-math/market-score';
import { HISTORY_ADV_WINDOWS } from '@/data/market-history/constants';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import { DEPTH_BANDS_PCT } from '@/data/market-prices/constants';
import type { DepthBand } from '@/data/market-prices/types';

// Feature-level adapter: map the 3.5.3a market-history + order-book-depth shapes
// into the pure Market Score leaf's neutral numeric inputs. This is where the
// EVE-domain choices live (which ADV window anchors the score, which near-touch
// depth bands stand in for the sell-side wall and the buy-side instant dump) —
// the math leaf stays free of any data-slice type. feature → data, allowed.
//
// CALIBRATION KNOBS (provisional — tuned against live data at the UX gate). Each
// is `satisfies`-pinned to the windows/bands the data layer actually computes, so
// retuning one to a value that isn't produced upstream is a COMPILE error, not a
// silent null score at runtime (the adapter looks these up by exact equality).

// The score is driven by the 30-day ADV window (coherent with the 30-day
// price-stability / demand-consistency window). The 7d/90d windows are shown in
// the breakdown for context only — they do NOT feed the score. PROVISIONAL.
export const SCORE_ADV_WINDOW_DAYS = 30 satisfies (typeof HISTORY_ADV_WINDOWS)[number];

// The near-touch SELL band that stands in for "the wall ahead of you if you list
// competitively": cumulative sell volume within this % of the best sell price.
// Best-anchored (3.5.3a), not pct5. PROVISIONAL.
export const SELL_WALL_BAND_PCT = 5 satisfies (typeof DEPTH_BANDS_PCT)[number];

// The tighter near-touch BUY band for the "instant liquidity if you dump now"
// breakdown detail: cumulative buy volume within this % of the best buy.
// PROVISIONAL.
export const INSTANT_DUMP_BAND_PCT = 2 satisfies (typeof DEPTH_BANDS_PCT)[number];

// Cumulative volume at a given near-touch band, or null when the ladder is
// absent (no orders / Fuzzwork fallback) or that band isn't present.
function depthAt(ladder: DepthBand[] | null, pct: number): number | null {
  if (!ladder) return null;
  return ladder.find((b) => b.pct === pct)?.cumVolume ?? null;
}

// The chosen ADV window's units/day, or null when that window holds no data.
function advFor(history: MarketHistoryInputs | null, windowDays: number): number | null {
  if (!history) return null;
  return history.averageDailyVolume.find((w) => w.days === windowDays)?.adv ?? null;
}

export function toMarketScoreInputs({
  outputUnits,
  history,
  buyDepth,
  sellDepth,
}: {
  outputUnits: number;
  history: MarketHistoryInputs | null;
  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;
}): MarketScoreInputs {
  return {
    outputUnits,
    adv: advFor(history, SCORE_ADV_WINDOW_DAYS),
    sellWallUnits: depthAt(sellDepth, SELL_WALL_BAND_PCT),
    instantDumpUnits: depthAt(buyDepth, INSTANT_DUMP_BAND_PCT),
    priceVolatility: history?.priceVolatility ?? null,
    volumeCv: history?.volumeCv ?? null,
  };
}
