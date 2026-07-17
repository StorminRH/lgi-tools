// Pure Market Score math for the Industry Planner: the "how sure can I sell this
// at this quantity?" liquidity axis that sits beside net margin's "how much?"
// (3.5.3b).
//
// Same dependency-free leaf discipline as profitability.ts / fees.ts — this
// module imports nothing from another slice and knows nothing about
// market-history or order-book shapes. Callers (the industry-planner feature,
// market-score-inputs.ts) adapt their rows into these plain numeric inputs, the
// same pattern as PriceOf / AdjustedPriceOf.
//
// The score composes THREE sub-signals (the prompt's "demand coverage" and
// "depth absorption" are fused into one time-to-clear liquidity signal):
//   1. liquidity   — time-to-clear days = (sell-side wall + your batch) / ADV
//   2. stability   — price volatility (CV of the daily average price)
//   3. consistency — zero-filled daily-volume CV (steady vs spiky demand)
// Composition is WEAKEST-LINK — a weighted geometric mean over the KNOWN
// signals, never an arithmetic average: one zeroed known signal floors the
// total. A missing input reads "unknown" and is excluded from the composite,
// never fabricated as a number. NO price/margin input feeds the score — margin
// is the other axis, and double-counting it here would conflate the two.
//
// CALIBRATION KNOBS (provisional — tuned against live data at the UX gate, NOT
// settled values): the *_MAX caps, the consistency band thresholds, and the
// sub-signal weights. The tests pin BEHAVIOUR (monotonicity, the weakest-link
// floor, unknown handling), never these specific numbers.

/**
 * Time-to-clear (days) at which the liquidity signal bottoms out: a batch that
 * would take a month of average volume to sell through (wall + your units)
 * scores 0. PROVISIONAL.
 */
export const CLEAR_DAYS_MAX = 30;

/**
 * Price-volatility CV at which stability bottoms out (~30% monthly price swing
 * → 0). PROVISIONAL.
 */
export const STABILITY_CV_MAX = 0.3;

/**
 * Zero-filled daily-volume CV at which consistency bottoms out. Volume CV runs
 * higher than price CV — a market that trades only a few days a month is very
 * spiky once the no-trade days are zero-filled — so the cap is higher.
 * PROVISIONAL.
 *
 * Confirmed intended (3.5.4a audit / Ryan, 2026-06-14): a volumeCv past this caps
 * consistency at exactly 0, and the weakest-link compose then floors the WHOLE
 * score to 0 (e.g. a barely-traded officer module). That hard 0 is the desired
 * "a thin market can't hide behind a healthy margin" read, not a miscalibration —
 * do not soften it to a low-but-nonzero floor without a fresh decision.
 */
export const CONSISTENCY_CV_MAX = 1.5;

// Wording thresholds on the raw volume CV for the demand-consistency readout
// (display only — "CV 0.3" is meaningless to a user). Internal to the band
// helper below. PROVISIONAL.
const CONSISTENCY_STEADY_CV = 0.5;
const CONSISTENCY_SPIKY_CV = 1.0;

// Sub-signal weights for the geometric-mean composition. Liquidity is the
// dominant "can I actually sell this?" signal; stability and consistency refine
// it. PROVISIONAL.
const WEIGHTS = { liquidity: 0.5, stability: 0.25, consistency: 0.25 } as const;

/**
 * Neutral numeric inputs — the feature adapter picks the ADV window and the
 * near-touch depth bands and hands over plain scalars (null = genuinely
 * unknown, distinct from a real zero).
 */
export interface MarketScoreInputs {
  outputUnits: number; // runs × quantityPerRun (≥ 1)
  adv: number | null; // chosen ADV window, units/day; null = no demand history
  sellWallUnits: number | null; // near-touch SELL cumVolume; null = no depth data
  instantDumpUnits: number | null; // near-touch BUY cumVolume (carried, unscored)
  priceVolatility: number | null; // CV of daily avg price; null = <2 priced days
  volumeCv: number | null; // zero-filled 30d volume CV; null = no data / zero mean
}

export type ConsistencyBand = 'steady' | 'moderate' | 'spiky';

/**
 * The fused liquidity signal, decomposed for the breakdown readout: the total
 * time-to-clear and its two parts (the wall ahead of you + your own batch),
 * plus the buy-side instant-dump detail (unscored).
 */
export interface LiquiditySignal {
  score: number | null; // normalized 0..1, null when ADV is unknown
  timeToClearDays: number | null;
  sellWallDays: number | null; // wall units / adv; null when the wall is unknown
  batchDays: number | null; // your output units / adv
  instantDumpUnits: number | null;
  // False when the sell-side wall is unknown — the clear-time estimate is then a
  // lower bound (your batch only), and the breakdown must say so.
  wallKnown: boolean;
}

export interface StabilitySignal {
  score: number | null;
  swingPct: number | null; // priceVolatility as a percentage, for the readout
}

export interface ConsistencySignal {
  score: number | null;
  volumeCv: number | null;
  band: ConsistencyBand | null;
}

export interface MarketScore {
  // 0..100, null when NO sub-signal is known (no fabricated number).
  score: number | null;
  // How many of the three scored signals contributed — the honest-degradation
  // counter the breakdown surfaces ("based on N of 3 signals").
  knownCount: number;
  liquidity: LiquiditySignal;
  stability: StabilitySignal;
  consistency: ConsistencySignal;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// Liquidity = time-to-clear. To sell your batch you must clear the standing
// sell-side wall ahead of you PLUS your own units, at the rate the market trades
// (ADV). ADV is required; with no demand history there is no clear-time to
// estimate. An unknown wall is treated as a lower bound (your batch only) and
// flagged via wallKnown, never fabricated as zero competition.
//
// Confirmed intended (3.5.4a audit / Ryan, 2026-06-14): time-to-clear is
// batch-relative, so a thin-but-consistent item scores HIGH for a SMALL batch
// (a few units genuinely clear fast even in a quiet market). That is the
// designed read — the score answers "can I sell THIS quantity?", not "is this a
// deep market?" — not a bug to be flattened by a market-depth penalty.
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

// Weighted geometric mean over the known signals. ln(0) = -Infinity, so any
// known signal at exactly 0 drives the composite to 0 — the weakest-link floor.
// Weights are renormalized over the present signals, so a single known signal
// scores as itself and an unknown one neither floors nor inflates the total.
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
