import { computeMarketScore } from '@/data/industry-math/market-score';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import type { DepthBand } from '@/data/market-prices/types';
import { toMarketScoreInputs } from './market-score-inputs';
import type { RecentBlueprint } from './recent-blueprints';

/** The price figures research reads; the refreshed price carries more. */
export interface ResearchPrice {
  bestBuy: number | null;
  bestSell: number | null;
  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;
}

export interface ResearchRow {
  blueprintTypeId: number;
  productTypeId: number;
  name: string;
  sell: number | null;
  buy: number | null;
  spreadPct: number | null;
  dailyVolume: number | null;
  score: number | null;
  clearDays: number | null;
}

export type ResearchSortKey = 'score' | 'volume' | 'spread' | 'sell';

export function spreadPct(buy: number | null, sell: number | null): number | null {
  if (buy === null || sell === null || sell <= 0 || buy <= 0) return null;
  return ((sell - buy) / sell) * 100;
}

/**
 * One watched product at Jita. The market score is scored for a single unit,
 * so its clear time is how long the market takes to absorb the listed wall.
 */
export function researchRow(
  entry: RecentBlueprint,
  name: string,
  price: ResearchPrice | undefined,
  history: MarketHistoryInputs | undefined,
): ResearchRow {
  const inputs = toMarketScoreInputs({
    outputUnits: 1,
    history: history ?? null,
    buyDepth: price?.buyDepth ?? null,
    sellDepth: price?.sellDepth ?? null,
  });
  const score = history === undefined ? null : computeMarketScore(inputs);
  const sell = price?.bestSell ?? null;
  const buy = price?.bestBuy ?? null;
  return {
    blueprintTypeId: entry.typeId,
    productTypeId: entry.productTypeId,
    name,
    sell,
    buy,
    spreadPct: spreadPct(buy, sell),
    dailyVolume: inputs.adv,
    score: score?.score ?? null,
    clearDays: score?.liquidity.timeToClearDays ?? null,
  };
}

const SORT_VALUE: Record<ResearchSortKey, (row: ResearchRow) => number | null> = {
  score: (row) => row.score,
  volume: (row) => row.dailyVolume,
  spread: (row) => row.spreadPct,
  sell: (row) => row.sell,
};

function highestFirst(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return b - a;
}

/** Highest first; rows still missing the figure sink to the bottom in list order. */
export function sortResearchRows(rows: readonly ResearchRow[], key: ResearchSortKey): ResearchRow[] {
  const value = SORT_VALUE[key];
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((a, b) => highestFirst(a.v, b.v) || a.index - b.index)
    .map(({ row }) => row);
}

export function formatClearDays(days: number | null): string {
  if (days === null) return '—';
  if (days < 1) return '<1d';
  return `${Math.round(days)}d`;
}
