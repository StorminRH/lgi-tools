import { CONFIDENCE_FACTOR_LABELS, type ConfidenceBand, type ConfidenceFactorId } from '@/data/industry-math/build-confidence';
import type { Momentum } from '@/data/industry-math/market-analytics';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatPct } from '@/lib/format/number';
import type { BatchSize, ResearchInsight } from './research-insight';

export const BAND_LABEL: Record<ConfidenceBand, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  avoid: 'Avoid',
};

export const BATCH_LABEL: Record<BatchSize, string> = {
  run: '1 run',
  slotDay: '1 slot-day',
  slotWeek: '1 slot-week',
};

/** One word per confidence factor, for tight chart axes and card strips. */
export const FACTOR_SHORT_LABEL: Record<ConfidenceFactorId, string> = {
  sellThrough: 'Sell',
  profitOdds: 'Odds',
  stability: 'Stable',
  demand: 'Demand',
  trend: 'Trend',
  history: 'History',
};

/** The weakest factor and the points it costs, for a one-line readout. */
export function weakestText(insight: ResearchInsight): string {
  const { weakest, factors } = insight.confidence;
  if (weakest === null) return 'No weak factor';
  const lost = Math.round(factors.find((factor) => factor.id === weakest)?.penalty ?? 0);
  return `Weakest: ${CONFIDENCE_FACTOR_LABELS[weakest].toLowerCase()} (−${lost})`;
}

export const MOMENTUM_LABEL: Record<Momentum, string> = { rising: 'Rising', falling: 'Sliding', flat: 'Steady' };

export type FigureTone = 'good' | 'warn' | 'bad' | 'plain';

export interface KeyFigure {
  id: string;
  label: string;
  value: string;
  note: string;
  tone: FigureTone;
}

export function formatDays(value: number | null): string {
  if (value === null) return '—';
  if (value < 1) return `${Math.max(1, Math.round(value * 24))}h`;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}d`;
}

export function signedPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}%`;
}

function marginTone(pct: number | null): FigureTone {
  if (pct === null) return 'plain';
  if (pct >= 15) return 'good';
  return pct >= 5 ? 'warn' : 'bad';
}

function oddsTone(p: number | null): FigureTone {
  if (p === null) return 'plain';
  if (p >= 0.8) return 'good';
  return p >= 0.6 ? 'warn' : 'bad';
}

function volTone(v: number | null): FigureTone {
  if (v === null) return 'plain';
  if (v < 0.03) return 'good';
  return v <= 0.07 ? 'warn' : 'bad';
}

function sellTone(d: number | null): FigureTone {
  if (d === null) return 'plain';
  if (d <= 7) return 'good';
  return d <= 21 ? 'warn' : 'bad';
}

function svrTone(svr: number | null): FigureTone {
  if (svr === null) return 'plain';
  if (svr >= 3) return 'good';
  return svr >= 1 ? 'warn' : 'bad';
}

function marginFigure({ outlook }: ResearchInsight): KeyFigure {
  const margin = outlook?.marginPct.p50 ?? null;
  return {
    id: 'margin',
    label: 'Expected margin',
    value: formatPct(margin),
    note: outlook === null ? 'No build cost yet' : `P10 ${formatPct(outlook.marginPct.p10)} · P90 ${formatPct(outlook.marginPct.p90)}`,
    tone: marginTone(margin),
  };
}

function oddsFigure({ outlook, cushionSigmas }: ResearchInsight): KeyFigure {
  return {
    id: 'odds',
    label: 'Profit odds',
    value: outlook === null ? '—' : `${Math.round(outlook.probProfit * 100)}%`,
    note: cushionSigmas === null ? 'Chance the sale clears breakeven' : `Price can fall ${cushionSigmas.toFixed(1)}σ before a loss`,
    tone: oddsTone(outlook?.probProfit ?? null),
  };
}

function iskFigure({ iskPerHour }: ResearchInsight): KeyFigure {
  const tone: FigureTone = iskPerHour === null ? 'plain' : iskPerHour > 0 ? 'good' : 'bad';
  return { id: 'iskh', label: 'ISK / hour', value: formatIsk(iskPerHour), note: 'Per slot, base job time', tone };
}

function sellFigure({ batch }: ResearchInsight): KeyFigure {
  const days = batch?.sellDays ?? null;
  return {
    id: 'sell',
    label: 'Sell-through',
    value: formatDays(days),
    note: batch === null ? 'No batch yet' : `${formatCompactQuantity(batch.units)} units at your share`,
    tone: sellTone(days),
  };
}

function flowFigure({ flow }: ResearchInsight): KeyFigure {
  return {
    id: 'flow',
    label: 'Traded / day',
    value: formatIsk(flow?.iskPerDay ?? null),
    note: flow === null ? '—' : `${formatCompactQuantity(flow.adv)} units · ${flow.tradedDays}/${flow.days} days`,
    tone: 'plain',
  };
}

/** The headline numbers for one product, each with a plain note on how to read it. */
export function keyFigures(insight: ResearchInsight): KeyFigure[] {
  const { volatility, svr, unit } = insight;
  return [
    marginFigure(insight),
    oddsFigure(insight),
    iskFigure(insight),
    sellFigure(insight),
    { id: 'svr', label: 'Slots absorbed', value: svr === null ? '—' : svr.toFixed(1), note: 'Daily volume ÷ one slot’s daily output', tone: svrTone(svr) },
    {
      id: 'vol',
      label: 'Daily swing',
      value: volatility === null ? '—' : `${(volatility * 100).toFixed(1)}%`,
      note: 'Typical one-day price move, robust',
      tone: volTone(volatility),
    },
    flowFigure(insight),
    {
      id: 'instant',
      label: 'Instant sell',
      value: formatPct(unit?.instantMarginPct ?? null),
      note: 'Margin dumping into buy orders now',
      tone: marginTone(unit?.instantMarginPct ?? null),
    },
  ];
}

function sellThroughDetail(insight: ResearchInsight): string {
  const clear = insight.market.liquidity.timeToClearDays;
  return clear === null ? 'No volume yet' : `≈ ${formatDays(clear)} to clear with the wall`;
}

/** One line per confidence factor saying what it read. */
export function factorDetails(insight: ResearchInsight): Record<ConfidenceFactorId, string> {
  const swing = insight.market.stability.swingPct;
  const band = insight.market.consistency.band;
  return {
    sellThrough: sellThroughDetail(insight),
    profitOdds: insight.outlook === null ? 'Needs a build cost' : `${Math.round(insight.outlook.probProfit * 100)}% above breakeven`,
    stability: swing === null ? 'No history yet' : `30-day price spread ${Math.round(swing)}%`,
    demand: band === null ? 'No history yet' : `Volume ${band}`,
    trend: insight.momentum === null ? 'Needs two weeks' : `Week vs month ${signedPct(insight.momentum.ratio * 100)}`,
    history: insight.flow === null ? 'No trades yet' : `Traded ${insight.flow.tradedDays} of ${insight.flow.days} days`,
  };
}

const MINOR_PENALTY = 5;

/** The sentence under the score: what holds it back, or that nothing much does. */
export function confidenceHeadline(insight: ResearchInsight): string {
  const { weakest, score, factors } = insight.confidence;
  if (score === null) return 'Not enough market data to score yet.';
  if (weakest === null) return 'Nothing holds this one back.';
  const label = CONFIDENCE_FACTOR_LABELS[weakest].toLowerCase();
  const detail = factorDetails(insight)[weakest];
  const lost = Math.round(factors.find((factor) => factor.id === weakest)?.penalty ?? 0);
  if (lost < MINOR_PENALTY) return `Solid across the board: the weakest factor, ${label}, costs ${lost} point${lost === 1 ? '' : 's'}.`;
  return `Held back by ${label} (−${lost}): ${detail.charAt(0).toLowerCase()}${detail.slice(1)}.`;
}

export function trendText(insight: ResearchInsight): string {
  if (insight.momentum === null) return '—';
  return `${MOMENTUM_LABEL[insight.momentum.direction]} ${signedPct(insight.momentum.ratio * 100)}`;
}

export function standingText(insight: ResearchInsight): string {
  const s = insight.standing;
  if (s === null) return '—';
  const word = s.position === 'rich' ? 'Above' : s.position === 'cheap' ? 'Below' : 'Near';
  return `${word} 90-day norm (${s.z >= 0 ? '+' : '−'}${Math.abs(s.z).toFixed(1)}σ)`;
}

export function fillMixText(insight: ResearchInsight): string {
  if (insight.sellSide === null) return '—';
  return `${Math.round(insight.sellSide * 100)}% of volume filled sell orders`;
}

