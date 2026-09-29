import { buildConfidence, type BuildConfidence, confidenceBand, type ConfidenceBand } from '@/data/industry-math/build-confidence';
import { DEFAULT_FEE_RATES } from '@/data/industry-math/fees';
import {
  clipRanges,
  type ClippedDay,
  dailyVolatility,
  drawdown,
  expectedListPrice,
  fillDays,
  flowStats,
  type FlowStats,
  type MarketDay,
  momentum,
  type MomentumRead,
  movingAverage,
  priceStanding,
  type PriceStanding,
  priceTrend,
  type PriceTrend,
  profitOutlook,
  type ProfitOutlook,
  projectedDrift,
  sellSideShare,
  sellThroughDays,
  weekdayVolumeIndex,
} from '@/data/industry-math/market-analytics';
import { computeMarketScore, type MarketScore } from '@/data/industry-math/market-score';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import type { DepthBand } from '@/data/market-prices/types';
import { toMarketScoreInputs } from './market-score-inputs';
import type { RecentBlueprint } from './recent-blueprints';
import type { ResearchEconomics } from './types';

export type BatchSize = 'run' | 'slotDay' | 'slotWeek';

export interface ResearchAssumptions {
  batch: BatchSize;
  /** The share of the market's daily volume the batch can take. */
  marketShare: number;
  salesTaxPct: number;
  brokerFeePct: number;
}

export const DEFAULT_ASSUMPTIONS: ResearchAssumptions = {
  batch: 'slotDay',
  marketShare: 0.2,
  salesTaxPct: DEFAULT_FEE_RATES.salesTax * 100,
  brokerFeePct: DEFAULT_FEE_RATES.brokerFee * 100,
};

export const CHART_DAYS = 90;
const SIGNAL_DAYS = 30;
const WEEKDAY_DAYS = 84;
const HORIZON_CAP_DAYS = 90;
const DAY_SECONDS = 86_400;
const BATCH_SLOT_DAYS: Record<BatchSize, number | null> = { run: null, slotDay: 1, slotWeek: 7 };

export interface BatchPlan {
  runs: number;
  units: number;
  buildDays: number;
  sellDays: number | null;
  horizonDays: number;
}

export interface UnitEconomics {
  cost: number;
  listPrice: number;
  undercut: number;
  /** Selling into buy orders now: sales tax only, no broker fee. */
  instantNet: number | null;
  instantMarginPct: number | null;
}

export type GateId = 'unprofitable' | 'illiquid' | 'thinHistory' | 'oversized';

export interface Gate {
  id: GateId;
  label: string;
}

export interface ResearchInsight {
  blueprintTypeId: number;
  productTypeId: number;
  name: string;
  loading: boolean;
  sell: number | null;
  buy: number | null;
  spreadPct: number | null;
  days: ClippedDay[];
  ma7: (number | null)[];
  ma30: (number | null)[];
  clippedShare: number;
  flow: FlowStats | null;
  volatility: number | null;
  trend: PriceTrend | null;
  momentum: MomentumRead | null;
  standing: PriceStanding | null;
  drawdown: number | null;
  sellSide: number | null;
  weekday: number[] | null;
  economics: ResearchEconomics | null;
  batch: BatchPlan | null;
  unit: UnitEconomics | null;
  outlook: ProfitOutlook | null;
  /** How many standard deviations of price move the margin can absorb over the horizon. */
  cushionSigmas: number | null;
  iskPerHour: number | null;
  /** Daily volume over one slot's daily output: how many slots of this the market can take. */
  svr: number | null;
  market: MarketScore;
  confidence: BuildConfidence;
  band: ConfidenceBand | null;
  gates: Gate[];
}

/** The price figures research reads; the refreshed price carries more. */
export interface ResearchPrice {
  bestBuy: number | null;
  bestSell: number | null;
  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;
}

export interface ResearchSource {
  entry: RecentBlueprint;
  name: string;
  price: ResearchPrice | undefined;
  history: MarketHistoryInputs | null | undefined;
  series: readonly MarketDay[] | undefined;
  economics: ResearchEconomics | null | undefined;
}

function batchRuns(batch: BatchSize, jobSeconds: number | null): number {
  const slotDays = BATCH_SLOT_DAYS[batch];
  if (slotDays === null || jobSeconds === null || jobSeconds <= 0) return 1;
  return Math.max(1, Math.floor((slotDays * DAY_SECONDS) / jobSeconds));
}

export function batchPlan(
  economics: ResearchEconomics,
  adv: number | null,
  assumptions: ResearchAssumptions,
): BatchPlan {
  const runs = batchRuns(assumptions.batch, economics.jobSeconds);
  const units = runs * economics.quantityPerRun;
  const buildDays = economics.jobSeconds === null ? 0 : (runs * economics.jobSeconds) / DAY_SECONDS;
  const sellDays = sellThroughDays(units, adv, assumptions.marketShare);
  // The average unit sells halfway through the selling window.
  const horizonDays = Math.min(HORIZON_CAP_DAYS, buildDays + (sellDays ?? 0) / 2);
  return { runs, units, buildDays, sellDays, horizonDays };
}

function spreadOf(buy: number | null, sell: number | null): number | null {
  if (buy === null || sell === null || buy <= 0 || sell <= 0) return null;
  return ((sell - buy) / sell) * 100;
}

function unitEconomics(
  economics: ResearchEconomics,
  sell: number,
  buy: number | null,
  days: readonly ClippedDay[],
  salesTax: number,
): UnitEconomics {
  const cost = (economics.inputCost + (economics.jobFee ?? 0)) / economics.quantityPerRun;
  const list = expectedListPrice(sell, days);
  const instantNet = buy === null ? null : buy * (1 - salesTax) - cost;
  return {
    cost,
    listPrice: list.price,
    undercut: list.undercut,
    instantNet,
    instantMarginPct: instantNet === null || buy === null || buy <= 0 ? null : (instantNet / buy) * 100,
  };
}

interface Signals {
  days: ClippedDay[];
  clippedShare: number;
  window: ClippedDay[];
  flow: FlowStats | null;
  volatility: number | null;
  trend: PriceTrend | null;
  momentum: MomentumRead | null;
}

function readSignals(series: readonly MarketDay[]): Signals {
  const filled = fillDays(series, CHART_DAYS);
  const { days, clippedShare } = clipRanges(filled);
  const window = days.slice(-SIGNAL_DAYS);
  return {
    days,
    clippedShare,
    window,
    flow: flowStats(window),
    volatility: dailyVolatility(window),
    trend: priceTrend(window),
    momentum: momentum(days),
  };
}

function gatesFor(insight: Pick<ResearchInsight, 'outlook' | 'batch' | 'flow' | 'days'>, share: number): Gate[] {
  const gates: Gate[] = [];
  const { outlook, batch, flow } = insight;
  if (outlook !== null && outlook.netPerUnit.p50 <= 0) {
    gates.push({ id: 'unprofitable', label: 'Loses money at the expected list price' });
  }
  if (batch !== null && flow !== null && flow.adv * SIGNAL_DAYS < batch.units) {
    gates.push({ id: 'illiquid', label: 'The market trades less than one batch a month' });
  } else if (batch?.sellDays != null && batch.sellDays > 14) {
    gates.push({ id: 'oversized', label: `Over two weeks to sell at a ${Math.round(share * 100)}% share` });
  }
  if (insight.days.filter((day) => day.traded).length < 14) {
    gates.push({ id: 'thinHistory', label: 'Fewer than 14 traded days on record' });
  }
  return gates;
}

function profitFigures(
  economics: ResearchEconomics | null,
  unit: UnitEconomics | null,
  signals: Signals,
  adv: number | null,
  assumptions: ResearchAssumptions,
) {
  if (economics === null || unit === null) return { batch: null, outlook: null, cushionSigmas: null, iskPerHour: null };
  const batch = batchPlan(economics, adv, assumptions);
  const outlook = profitOutlook({
    unitCost: unit.cost,
    spot: unit.listPrice,
    sellFeeRate: (assumptions.salesTaxPct + assumptions.brokerFeePct) / 100,
    dailyVol: signals.volatility ?? 0,
    driftPerDay: projectedDrift(signals.trend),
    horizonDays: batch.horizonDays,
  });
  const sigmaH = (signals.volatility ?? 0) * Math.sqrt(batch.horizonDays);
  const cushionSigmas = sigmaH > 0 ? outlook.cushion / sigmaH : null;
  const hours = economics.jobSeconds === null || economics.jobSeconds <= 0 ? null : economics.jobSeconds / 3600;
  const iskPerHour = hours === null ? null : (outlook.netPerUnit.p50 * economics.quantityPerRun) / hours;
  return { batch, outlook, cushionSigmas, iskPerHour };
}

function slotSvr(economics: ResearchEconomics | null, adv: number | null): number | null {
  if (economics === null || adv === null || economics.jobSeconds === null || economics.jobSeconds <= 0) return null;
  const unitsPerSlotDay = (economics.quantityPerRun * DAY_SECONDS) / economics.jobSeconds;
  return adv / unitsPerSlotDay;
}

function marketFor(source: ResearchSource, units: number): MarketScore {
  return computeMarketScore(
    toMarketScoreInputs({
      outputUnits: units,
      history: source.history ?? null,
      buyDepth: source.price?.buyDepth ?? null,
      sellDepth: source.price?.sellDepth ?? null,
    }),
  );
}

function confidenceFor(market: MarketScore, outlook: ProfitOutlook | null, signals: Signals): BuildConfidence {
  return buildConfidence({
    market,
    probProfit: outlook?.probProfit ?? null,
    momentum: signals.momentum?.ratio ?? null,
    tradedDays: signals.flow?.tradedDays ?? null,
    windowDays: SIGNAL_DAYS,
  });
}

function priceSeries(signals: Signals, sell: number | null) {
  const averages = signals.days.map((day) => day.average);
  return {
    days: signals.days,
    ma7: movingAverage(averages, 7),
    ma30: movingAverage(averages, 30),
    clippedShare: signals.clippedShare,
    flow: signals.flow,
    volatility: signals.volatility,
    trend: signals.trend,
    momentum: signals.momentum,
    standing: sell === null ? null : priceStanding(sell, signals.days),
    drawdown: drawdown(signals.days),
    sellSide: sellSideShare(signals.window),
    weekday: weekdayVolumeIndex(signals.days.slice(-WEEKDAY_DAYS)),
  };
}

/** Everything the research views read about one watched product, under the chosen assumptions. */
export function researchInsight(source: ResearchSource, assumptions: ResearchAssumptions): ResearchInsight {
  const economics = source.economics ?? null;
  const sell = source.price?.bestSell ?? null;
  const buy = source.price?.bestBuy ?? null;
  const signals = readSignals(source.series ?? []);
  const adv = signals.flow?.adv ?? null;
  const unit =
    economics === null || sell === null
      ? null
      : unitEconomics(economics, sell, buy, signals.days, assumptions.salesTaxPct / 100);
  const profit = profitFigures(economics, unit, signals, adv, assumptions);
  const market = marketFor(source, profit.batch?.units ?? 1);
  const confidence = confidenceFor(market, profit.outlook, signals);
  const insight = {
    blueprintTypeId: source.entry.typeId,
    productTypeId: source.entry.productTypeId,
    name: source.name,
    loading: source.series === undefined || source.price === undefined,
    sell,
    buy,
    spreadPct: spreadOf(buy, sell),
    ...priceSeries(signals, sell),
    economics,
    unit,
    ...profit,
    svr: slotSvr(economics, adv),
    market,
    confidence,
    band: confidenceBand(confidence.score),
  };
  return { ...insight, gates: gatesFor(insight, assumptions.marketShare) };
}

export type InsightSortKey = 'confidence' | 'iskPerHour' | 'margin' | 'iskVolume' | 'momentum';

const SORT_VALUE: Record<InsightSortKey, (insight: ResearchInsight) => number | null> = {
  confidence: (insight) => insight.confidence.score,
  iskPerHour: (insight) => insight.iskPerHour,
  margin: (insight) => insight.outlook?.marginPct.p50 ?? null,
  iskVolume: (insight) => insight.flow?.iskPerDay ?? null,
  momentum: (insight) => insight.momentum?.ratio ?? null,
};

function highestFirst(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return b - a;
}

/** Highest first; rows still missing the figure sink to the bottom in list order. */
export function sortInsights(insights: readonly ResearchInsight[], key: InsightSortKey): ResearchInsight[] {
  const value = SORT_VALUE[key];
  return insights
    .map((insight, index) => ({ insight, index, v: value(insight) }))
    .sort((a, b) => highestFirst(a.v, b.v) || a.index - b.index)
    .map(({ insight }) => insight);
}
