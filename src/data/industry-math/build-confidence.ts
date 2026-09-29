import type { MarketScore } from './market-score';

/**
 * How sure a build is to pay: the market score's three signals (can the batch
 * sell, is the price steady, is demand steady) plus the odds the sale clears
 * cost, whether the price is sliding, and how much history backs it all.
 * Blended as a weighted geometric mean like the market score, so one weak
 * factor pulls the whole score down rather than hiding behind a strong one.
 */

export type ConfidenceFactorId = 'sellThrough' | 'profitOdds' | 'stability' | 'demand' | 'trend' | 'history';

export const CONFIDENCE_WEIGHTS: Record<ConfidenceFactorId, number> = {
  sellThrough: 0.25,
  profitOdds: 0.25,
  stability: 0.15,
  demand: 0.15,
  trend: 0.1,
  history: 0.1,
};

export const CONFIDENCE_FACTOR_LABELS: Record<ConfidenceFactorId, string> = {
  sellThrough: 'Sell-through',
  profitOdds: 'Profit odds',
  stability: 'Price stability',
  demand: 'Demand',
  trend: 'Trend',
  history: 'History depth',
};

export interface ConfidenceFactor {
  id: ConfidenceFactorId;
  /** 0 to 1; null when the factor can't be read yet. */
  score: number | null;
  /** This factor's share of the blend, among the factors that are known. */
  share: number;
  /** Points of the 100 this factor costs the final score. */
  penalty: number;
}

export interface BuildConfidence {
  /** 0 to 100; null when no factor is known. */
  score: number | null;
  factors: ConfidenceFactor[];
  /** The factor that costs the most points. */
  weakest: ConfidenceFactorId | null;
}

export interface BuildConfidenceInputs {
  market: MarketScore;
  /** Chance the batch sells above breakeven; null without a build cost. */
  probProfit: number | null;
  /** EMA7 over EMA30, less one; null without two weeks of history. */
  momentum: number | null;
  tradedDays: number | null;
  windowDays: number;
}

const ORDER: ConfidenceFactorId[] = ['sellThrough', 'profitOdds', 'stability', 'demand', 'trend', 'history'];
// A rising or flat price costs nothing; a week about 6% under its month halves the factor.
const TREND_SLIDE_SCALE = 8;

/** Only a sliding price costs points; strength isn't rewarded, since it may not last the build. */
export function trendScore(momentum: number | null): number | null {
  if (momentum === null) return null;
  return Math.max(0, Math.min(1, 1 + TREND_SLIDE_SCALE * Math.min(0, momentum)));
}
// A factor at zero still leaves a score to rank by: each counts from 2 at worst.
export const FACTOR_FLOOR = 0.02;

function factorScores(inputs: BuildConfidenceInputs): Record<ConfidenceFactorId, number | null> {
  const history =
    inputs.tradedDays === null || inputs.windowDays <= 0
      ? null
      : Math.min(1, inputs.tradedDays / inputs.windowDays);
  return {
    sellThrough: inputs.market.liquidity.score,
    profitOdds: inputs.probProfit,
    stability: inputs.market.stability.score,
    demand: inputs.market.consistency.score,
    trend: trendScore(inputs.momentum),
    history,
  };
}

export function buildConfidence(inputs: BuildConfidenceInputs): BuildConfidence {
  const scores = factorScores(inputs);
  const known = ORDER.filter((id) => scores[id] !== null);
  const weightSum = known.reduce((sum, id) => sum + CONFIDENCE_WEIGHTS[id], 0);
  if (known.length === 0 || weightSum === 0) {
    return {
      score: null,
      factors: ORDER.map((id) => ({ id, score: null, share: 0, penalty: 0 })),
      weakest: null,
    };
  }
  const logTerm = (id: ConfidenceFactorId) =>
    -(CONFIDENCE_WEIGHTS[id] / weightSum) * Math.log(Math.max(FACTOR_FLOOR, scores[id] ?? 1));
  const totalLog = known.reduce((sum, id) => sum + logTerm(id), 0);
  const blended = Math.exp(-totalLog);
  const score = Math.round(blended * 100);
  const lost = 100 - blended * 100;
  const factors = ORDER.map((id): ConfidenceFactor => {
    const value = scores[id];
    if (value === null) return { id, score: null, share: 0, penalty: 0 };
    return {
      id,
      score: value,
      share: CONFIDENCE_WEIGHTS[id] / weightSum,
      penalty: totalLog === 0 ? 0 : (lost * logTerm(id)) / totalLog,
    };
  });
  const weakest = factors.reduce<ConfidenceFactor | null>(
    (worst, factor) => (factor.score !== null && factor.penalty > (worst?.penalty ?? 0) ? factor : worst),
    null,
  );
  return { score, factors, weakest: weakest?.id ?? null };
}

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'avoid';

const CONFIDENCE_BAND_FLOORS: Record<ConfidenceBand, number> = { high: 75, medium: 55, low: 35, avoid: 0 };

export function confidenceBand(score: number | null): ConfidenceBand | null {
  if (score === null) return null;
  if (score >= CONFIDENCE_BAND_FLOORS.high) return 'high';
  if (score >= CONFIDENCE_BAND_FLOORS.medium) return 'medium';
  if (score >= CONFIDENCE_BAND_FLOORS.low) return 'low';
  return 'avoid';
}
