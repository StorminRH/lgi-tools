import type { MarketScore, MarketScoreInputs } from '@/data/industry-math/market-score';
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

// Staleness flag threshold (DISPLAY-ONLY, NOT a score input). When the product's
// most-recent traded day is more than this many days before today, the panel
// surfaces a caveat. The composite stays keyed to latestDate (asOf = the latest
// row), so it scores the type's most recent active period regardless of how long
// ago that was — honest degradation here is a FLAG, never a score change.
// Tempering the composite by latestDate-vs-today is a separate deferred item
// (backlog). 14d clears the normal daily/weekly trading cadence (fresh history
// ends yesterday) while catching genuinely stale series well before the
// egregious month+ case (PLEX scored 94 on ~11-month-old Forge history).
// PROVISIONAL — tuned at the UX gate.
export const STALENESS_FLAG_DAYS = 14;

// Whole days between a "YYYY-MM-DD" history date and a client `now` (ms), or null
// when the date is absent. UTC integer-day arithmetic (mirrors aggregate.ts
// toDayNumber) avoids any timezone/DST drift. The clock is the CALLER's — a
// client mount read — so this stays pure and testable and never touches the wall
// clock itself (the aggregate layer is deliberately clock-free; the consumer
// derives staleness-vs-today, per market-history/types.ts latestDate).
export function daysSinceHistoryDate(latestDate: string | null, nowMs: number): number | null {
  if (latestDate === null) return null;
  const parsed = Date.parse(`${latestDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null; // a malformed date is "unknown", never NaN
  const day = Math.floor(parsed / 86_400_000);
  const today = Math.floor(nowMs / 86_400_000);
  return today - day;
}

// The time-to-clear phrase for the liquidity signal row.
function daysPhrase(n: number): string {
  if (n < 1) return '<1 day';
  const r = Math.round(n);
  return `${r} day${r === 1 ? '' : 's'}`;
}

// Compact age label for the staleness flag (the /sites meta-strip idiom): days
// under a week, weeks under a month, months beyond.
function ageLabel(days: number): string {
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

const BAND_WORD = { steady: 'steady', moderate: 'moderate', spiky: 'spiky' } as const;

// The concrete value shown in parentheses for each Market Score signal row (the
// live-derived bit; the description beside it is fixed copy).
export function signalValues(score: MarketScore): {
  liquidity: string;
  stability: string;
  demand: string;
} {
  return {
    liquidity:
      score.liquidity.timeToClearDays === null
        ? 'clear time unknown'
        : `≈ ${daysPhrase(score.liquidity.timeToClearDays)} to clear`,
    stability:
      score.stability.swingPct === null ? 'swing unknown' : `${Math.round(score.stability.swingPct)}%`,
    demand: score.consistency.band === null ? 'demand unknown' : BAND_WORD[score.consistency.band],
  };
}

// Everything the Market Score tile renders from, derived in one pure pass: the
// display score (or the '…' placeholder before the seed settles), the three
// signal values, the breakdown heading, and the staleness flag/note derived from
// the caller's client clock (`nowMs` is null before the mount effect fills it,
// so the static prerender never reads the wall clock).
export function marketScoreView(
  score: MarketScore,
  seeded: boolean,
  history: { latestDate: string | null } | null | undefined,
  nowMs: number | null,
): {
  scoreDisplay: string;
  signals: { liquidity: string; stability: string; demand: string };
  breakdownHeading: string;
  staleAge: string | null;
  staleNote: { latestDate: string; age: string } | null;
} {
  const latestDate = history?.latestDate ?? null;
  const staleDays = nowMs === null ? null : daysSinceHistoryDate(latestDate, nowMs);
  const staleAge = staleDays !== null && staleDays >= STALENESS_FLAG_DAYS ? ageLabel(staleDays) : null;
  const scoreText = score.score === null ? '—' : String(score.score);
  return {
    scoreDisplay: seeded || score.score !== null ? scoreText : '…',
    signals: signalValues(score),
    breakdownHeading:
      score.score === null ? 'Market score — no history yet' : 'Score blends 3 live signals',
    staleAge,
    staleNote: staleAge !== null && latestDate !== null ? { latestDate, age: staleAge } : null,
  };
}

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
