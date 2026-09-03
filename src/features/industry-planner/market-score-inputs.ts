import type { MarketScore, MarketScoreInputs } from '@/data/industry-math/market-score';
import { HISTORY_ADV_WINDOWS } from '@/data/market-history/constants';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import { DEPTH_BANDS_PCT } from '@/data/market-prices/constants';
import type { DepthBand } from '@/data/market-prices/types';

const SCORE_ADV_WINDOW_DAYS = 30 satisfies (typeof HISTORY_ADV_WINDOWS)[number];

export const SELL_WALL_BAND_PCT = 5 satisfies (typeof DEPTH_BANDS_PCT)[number];

export const INSTANT_DUMP_BAND_PCT = 2 satisfies (typeof DEPTH_BANDS_PCT)[number];

export const STALENESS_FLAG_DAYS = 14;

export function daysSinceHistoryDate(latestDate: string | null, nowMs: number): number | null {
  if (latestDate === null) return null;
  const parsed = Date.parse(`${latestDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  const day = Math.floor(parsed / 86_400_000);
  const today = Math.floor(nowMs / 86_400_000);
  return today - day;
}

function daysPhrase(n: number): string {
  if (n < 1) return '<1 day';
  const r = Math.round(n);
  return `${r} day${r === 1 ? '' : 's'}`;
}

function ageLabel(days: number): string {
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

const BAND_WORD = { steady: 'steady', moderate: 'moderate', spiky: 'spiky' } as const;

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

function depthAt(ladder: DepthBand[] | null, pct: number): number | null {
  if (!ladder) return null;
  return ladder.find((b) => b.pct === pct)?.cumVolume ?? null;
}

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
