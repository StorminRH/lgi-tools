export const CLEAR_DAYS_MAX = 30;

export const STABILITY_CV_MAX = 0.3;

export const CONSISTENCY_CV_MAX = 1.5;

const CONSISTENCY_STEADY_CV = 0.5;
const CONSISTENCY_SPIKY_CV = 1.0;

const WEIGHTS = { liquidity: 0.5, stability: 0.25, consistency: 0.25 } as const;

export interface MarketScoreInputs {
  outputUnits: number;
  adv: number | null;
  sellWallUnits: number | null;
  instantDumpUnits: number | null;
  priceVolatility: number | null;
  volumeCv: number | null;
}

export type ConsistencyBand = 'steady' | 'moderate' | 'spiky';

export interface LiquiditySignal {
  score: number | null;
  timeToClearDays: number | null;
  sellWallDays: number | null;
  batchDays: number | null;
  instantDumpUnits: number | null;

  wallKnown: boolean;
}

export interface StabilitySignal {
  score: number | null;
  swingPct: number | null;
}

export interface ConsistencySignal {
  score: number | null;
  volumeCv: number | null;
  band: ConsistencyBand | null;
}

export interface MarketScore {

  score: number | null;

  knownCount: number;
  liquidity: LiquiditySignal;
  stability: StabilitySignal;
  consistency: ConsistencySignal;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function computeLiquidity(inputs: MarketScoreInputs): LiquiditySignal {
  const { outputUnits, adv, sellWallUnits, instantDumpUnits } = inputs;
  const wallKnown = sellWallUnits !== null;
  if (adv === null || adv <= 0) {
    return {
      score: null,
      timeToClearDays: null,
      sellWallDays: null,
      batchDays: null,
      instantDumpUnits,
      wallKnown,
    };
  }
  const batchDays = outputUnits / adv;
  const sellWallDays = wallKnown ? sellWallUnits / adv : null;
  const timeToClearDays = batchDays + (sellWallDays ?? 0);
  return {
    score: clamp01(1 - timeToClearDays / CLEAR_DAYS_MAX),
    timeToClearDays,
    sellWallDays,
    batchDays,
    instantDumpUnits,
    wallKnown,
  };
}

function computeStability(priceVolatility: number | null): StabilitySignal {
  if (priceVolatility === null) return { score: null, swingPct: null };
  return {
    score: clamp01(1 - priceVolatility / STABILITY_CV_MAX),
    swingPct: priceVolatility * 100,
  };
}

function consistencyBand(cv: number): ConsistencyBand {
  if (cv <= CONSISTENCY_STEADY_CV) return 'steady';
  if (cv <= CONSISTENCY_SPIKY_CV) return 'moderate';
  return 'spiky';
}

function computeConsistency(volumeCv: number | null): ConsistencySignal {
  if (volumeCv === null) return { score: null, volumeCv: null, band: null };
  return {
    score: clamp01(1 - volumeCv / CONSISTENCY_CV_MAX),
    volumeCv,
    band: consistencyBand(volumeCv),
  };
}

function compose(
  parts: { score: number | null; weight: number }[],
): { score: number | null; knownCount: number } {
  let weightSum = 0;
  let lnSum = 0;
  let knownCount = 0;
  for (const p of parts) {
    if (p.score === null) continue;
    knownCount += 1;
    weightSum += p.weight;
    lnSum += p.weight * Math.log(p.score);
  }
  if (knownCount === 0 || weightSum === 0) return { score: null, knownCount };
  return { score: Math.round(Math.exp(lnSum / weightSum) * 100), knownCount };
}

export function computeMarketScore(inputs: MarketScoreInputs): MarketScore {
  const liquidity = computeLiquidity(inputs);
  const stability = computeStability(inputs.priceVolatility);
  const consistency = computeConsistency(inputs.volumeCv);
  const { score, knownCount } = compose([
    { score: liquidity.score, weight: WEIGHTS.liquidity },
    { score: stability.score, weight: WEIGHTS.stability },
    { score: consistency.score, weight: WEIGHTS.consistency },
  ]);
  return { score, knownCount, liquidity, stability, consistency };
}
