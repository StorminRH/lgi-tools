import type { ConfidenceLevel } from '@/components/ui/price-confidence';
import { toneTextClass, type Tone } from '@/components/ui/tones';
import { ACTIVITY_ID_LABEL } from '@/data/eve-data/constants';
import type { PriceSource } from '@/data/market-prices/types';
import { isBoundaryStaleMs } from '@/lib/esi-datasets/freshness';
import type { NodeMeState } from './me-overrides';

const THIN_MARGIN_PCT = 5;

export type EfficiencyToneState = NodeMeState | 'bonus' | 'reaction';

export const PLANNER_DISCLOSURE_TRIGGER_CLASS =
  'border-border-soft bg-bg-deep text-isk shadow-field-inset hover:border-border-idle hover:bg-row-active hover:text-isk data-[popup-open]:border-border-idle data-[popup-open]:bg-row-active';

export const RELATED_NODE_ROW_CLASS = 'ring-1 ring-inset ring-isk';

export const HERO_LOCATION_GROUP_CLASS =
  'flex w-full min-w-0 max-w-[332px] sm:w-[332px] flex-col justify-center gap-1.5';

export const HERO_LOCATION_ROW_CLASS = 'flex min-w-0 items-center gap-2';

export const HERO_LOCATION_CONTROL_WELL_CLASS = 'min-w-0 flex-1 max-w-[260px]';

export const EFFICIENCY_TONE_CLASSES: Record<
  EfficiencyToneState,
  { fill: string; glow: string; stroke: string; text: string; frame: string }
> = {
  unowned: {
    fill: 'fill-none',
    glow: '',
    stroke: 'stroke-muted',
    text: 'text-muted',
    frame: 'border-border-soft',
  },
  owned: {
    fill: 'fill-evb-bright',
    glow: 'drop-shadow-[0_0_4px_var(--color-evb-glow)]',
    stroke: 'stroke-evb-bright',
    text: 'text-evb-bright',
    frame: 'border-isk',
  },
  manual: {
    fill: 'fill-[var(--color-dps-mid)]',
    glow: 'drop-shadow-[0_0_4px_var(--color-dps-mid)]',
    stroke: 'stroke-[var(--color-dps-mid)]',
    text: 'text-[var(--color-dps-mid)]',
    frame: 'border-[var(--color-dps-mid)]',
  },
  bonus: {
    fill: 'fill-[var(--color-isk)]',
    glow: 'drop-shadow-[0_0_4px_var(--color-isk)]',
    stroke: 'stroke-[var(--color-isk)]',
    text: 'text-isk',
    frame: 'border-isk',
  },
  reaction: {
    fill: 'fill-[var(--color-reaction-purple)]',
    glow: 'drop-shadow-[0_0_4px_var(--color-reaction-purple)]',
    stroke: 'stroke-[var(--color-reaction-purple)]',
    text: 'text-[var(--color-reaction-purple)]',
    frame: 'border-[var(--color-reaction-purple)]',
  },
};

export function marginToneClass(marginPct: number | null): string {
  if (marginPct === null) return 'text-muted';
  if (marginPct < 0) return toneTextClass('red');
  if (marginPct < THIN_MARGIN_PCT) return toneTextClass('orange');
  return toneTextClass('green');
}

export interface MarginFigures {
  showNet: boolean;
  margin: number | null;
  marginPct: number | null;
  sign: string;
  missingSystemCostIndex: boolean;
  missingAdjustedPriceCount: number;
}

export function deriveMarginFigures(
  summary: { margin: number | null; marginPct: number | null } | null,
  net: {
    netMargin: number | null;
    netMarginPct: number | null;
    jobFee: { missingSystemCostIndex: boolean; missingAdjustedPriceTypeIds: readonly unknown[] };
  } | null,
): MarginFigures {
  const showNet = net !== null;
  const margin = net !== null ? net.netMargin : (summary?.margin ?? null);
  const marginPct = net !== null ? net.netMarginPct : (summary?.marginPct ?? null);
  return {
    showNet,
    margin,
    marginPct,
    sign: margin !== null && margin > 0 ? '+' : '',
    missingSystemCostIndex: net !== null ? net.jobFee.missingSystemCostIndex : false,
    missingAdjustedPriceCount: net !== null ? net.jobFee.missingAdjustedPriceTypeIds.length : 0,
  };
}

export function activityLabel(activityId: number): string {
  return ACTIVITY_ID_LABEL[activityId] ?? 'Industry';
}

export interface Category {
  label: string;
  tone: Tone;
  order: number;
}

const MINERALS: Category = { label: 'Minerals', tone: 'neutral', order: 21 };
const ICE: Category = { label: 'Ice Products', tone: 'blue', order: 22 };
const GAS: Category = { label: 'Gas', tone: 'teal', order: 23 };
const MOON: Category = { label: 'Moon Materials', tone: 'magenta', order: 24 };
const SALVAGE: Category = { label: 'Salvage', tone: 'yellow', order: 25 };
const PLANETARY: Category = { label: 'Planetary', tone: 'orange-soft', order: 26 };
const OTHER_MATERIAL: Category = { label: 'Other Materials', tone: 'neutral', order: 29 };

const RAW_BY_GROUP: Record<string, Category> = {
  Mineral: MINERALS,
  'Ice Product': ICE,
  'Harvestable Cloud': GAS,
  'Moon Materials': MOON,
  'Ancient Salvage': SALVAGE,
  'Salvaged Materials': SALVAGE,
  'Named Components': SALVAGE,
  'Rogue Drone Components': SALVAGE,
  'Abyssal Materials': SALVAGE,
};

export function classifyRaw(groupName: string, categoryName: string): Category {
  return (
    RAW_BY_GROUP[groupName] ??
    (categoryName === 'Planetary Commodities' ? PLANETARY : OTHER_MATERIAL)
  );
}

const REACTION_ACTIVITY_ID = 11;

export const REACTION_NODE_LABEL = 'Reaction';

export interface NodeLabel {
  label: string;
  tone: Tone;
}

export function classifyBuildNode(args: {
  isRaw: boolean;
  isRoot: boolean;
  activityId?: number;
  groupName: string;
  categoryName: string;
}): NodeLabel {
  const { isRaw, isRoot, activityId, groupName, categoryName } = args;
  if (isRaw) {
    return { label: groupName || categoryName || 'Raw Material', tone: classifyRaw(groupName, categoryName).tone };
  }
  if (isRoot) {
    return { label: groupName || categoryName || 'Final Product', tone: 'teal' };
  }
  if (activityId === REACTION_ACTIVITY_ID) {
    return { label: REACTION_NODE_LABEL, tone: 'purple' };
  }
  return { label: groupName || categoryName || 'Manufacturing', tone: 'blue' };
}

const THIN_LIQUIDITY_UNITS = 100;

const HIGH_CONFIDENCE_SHARE = 0.75;
const MEDIUM_CONFIDENCE_SHARE = 0.4;

export interface ConfidenceInput {
  source: PriceSource | null;
  buyVolume: number | null;
  unitBuy: number | null;
  staleAfterMs: number | null;
}

export interface RowConfidence {
  level: ConfidenceLevel;
  reasons: string[];
}

export interface AggregateConfidence {
  level: ConfidenceLevel;
  summary: string;
}

export function priceConfidence(input: ConfidenceInput, nowMs: number): RowConfidence {
  if (input.staleAfterMs === null) {
    return { level: 'unknown', reasons: ['No price data yet'] };
  }
  if (input.unitBuy === null) {
    return { level: 'low', reasons: ['No live price — excluded from cost'] };
  }
  const reasons: string[] = [];
  if (isBoundaryStaleMs(input.staleAfterMs, nowMs)) {
    reasons.push('Stale — price may have moved');
  }
  if (input.source !== null && input.source !== 'esi') reasons.push('Fallback price source');
  if (input.buyVolume !== null && input.buyVolume < THIN_LIQUIDITY_UNITS) {
    reasons.push('Thin market depth');
  }
  return reasons.length === 0 ? { level: 'high', reasons: [] } : { level: 'medium', reasons };
}

const THIN_SELL_ANCHOR_RATIO = 0.9;

export function sellAnchorConfidence(product: {
  bestSell: number | null | undefined;
  pct5Sell: number | null | undefined;
}): RowConfidence | null {
  const { bestSell, pct5Sell } = product;

  if (bestSell == null || pct5Sell == null || pct5Sell <= 0) return null;
  if (bestSell / pct5Sell >= THIN_SELL_ANCHOR_RATIO) return null;
  return { level: 'medium', reasons: ['Price anchored by a thin order'] };
}

export interface RegionalDiscountCallout {
  systemId: number;
  pct: number;
  units: number;
}

export function regionalDiscountCallout(product: {
  regionalDiscount?: {
    systemId?: number | null;
    price?: number | null;
    pct?: number | null;
    units?: number | null;
  } | null;
}): RegionalDiscountCallout | null {
  const d = product.regionalDiscount;
  if (d == null) return null;
  if (typeof d.systemId !== 'number' || typeof d.pct !== 'number' || typeof d.units !== 'number') {
    return null;
  }
  if (!Number.isFinite(d.pct) || d.pct <= 0 || !Number.isFinite(d.units) || d.units <= 0) {
    return null;
  }
  return { systemId: d.systemId, pct: Math.round(d.pct), units: d.units };
}

export interface ConfidenceCounts {
  high: number;
  total: number;
  stale: number;
  fallback: number;
  thin: number;
  missing: number;
}

export function aggregateConfidenceFromCounts(c: ConfidenceCounts): AggregateConfidence {
  if (c.total === 0) return { level: 'unknown', summary: 'No materials to price' };

  const share = c.high / c.total;
  const level: ConfidenceLevel =
    share >= HIGH_CONFIDENCE_SHARE
      ? 'high'
      : share >= MEDIUM_CONFIDENCE_SHARE
        ? 'medium'
        : 'low';

  const parts: string[] = [];
  if (c.stale) parts.push(`${c.stale} stale`);
  if (c.fallback) parts.push(`${c.fallback} fallback`);
  if (c.thin) parts.push(`${c.thin} illiquid`);
  if (c.missing) parts.push(`${c.missing} missing`);
  return { level, summary: parts.length ? parts.join(' · ') : 'all live · liquid' };
}

type RowCounts = Omit<ConfidenceCounts, 'total'>;

function classifyInput(input: ConfidenceInput, nowMs: number): RowCounts {
  const { level } = priceConfidence(input, nowMs);
  const counts: RowCounts = { high: 0, stale: 0, fallback: 0, thin: 0, missing: 0 };
  if (level === 'high') counts.high = 1;
  if (level === 'low' || level === 'unknown') counts.missing = 1;
  if (input.staleAfterMs !== null && input.unitBuy !== null) {
    if (isBoundaryStaleMs(input.staleAfterMs, nowMs)) counts.stale = 1;
    if (input.source !== null && input.source !== 'esi') counts.fallback = 1;
    if (input.buyVolume !== null && input.buyVolume < THIN_LIQUIDITY_UNITS) counts.thin = 1;
  }
  return counts;
}

export function aggregateConfidence(
  inputs: ConfidenceInput[],
  nowMs: number,
): AggregateConfidence {
  const totals: RowCounts = { high: 0, stale: 0, fallback: 0, thin: 0, missing: 0 };
  for (const input of inputs) {
    const counts = classifyInput(input, nowMs);
    totals.high += counts.high;
    totals.stale += counts.stale;
    totals.fallback += counts.fallback;
    totals.thin += counts.thin;
    totals.missing += counts.missing;
  }

  return aggregateConfidenceFromCounts({ ...totals, total: inputs.length });
}
