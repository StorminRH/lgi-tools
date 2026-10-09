import { cn } from '@/components/ui/cn';
import { fieldVariants, triggerShape } from '@/components/ui/input';
import type { ConfidenceLevel } from '@/components/ui/price-confidence';
import { toneTextClass, type Tone } from '@/components/ui/tones';
import { ACTIVITY_ID_LABEL } from '@/data/eve-data/constants';
import type { NodeMeState } from './me-overrides';

const THIN_MARGIN_PCT = 5;

export type EfficiencyToneState = NodeMeState | 'bonus' | 'reaction';

/** The rail's tool buttons wear the frosted trigger the profile picker wears. */
export const PLANNER_TOOL_TRIGGER_CLASS = cn(
  fieldVariants({ size: 'md' }),
  triggerShape,
  'flex cursor-pointer items-center justify-between gap-2 whitespace-nowrap font-ui text-nav text-name',
);

export const EFFICIENCY_TONE_CLASSES: Record<
  EfficiencyToneState,
  { glow: string; text: string; frame: string }
> = {
  unowned: {
    glow: '',
    text: 'text-muted',
    // An unowned blueprint's icon looks like any other until its research says something.
    frame: 'border-transparent',
  },
  owned: {
    glow: 'drop-shadow-[0_0_4px_var(--color-evb-glow)]',
    text: 'text-evb-bright',
    frame: 'border-isk',
  },
  manual: {
    glow: 'drop-shadow-[0_0_4px_var(--color-dps-mid)]',
    text: 'text-[var(--color-dps-mid)]',
    frame: 'border-[var(--color-dps-mid)]',
  },
  bonus: {
    glow: 'drop-shadow-[0_0_4px_var(--color-isk)]',
    text: 'text-isk',
    frame: 'border-isk',
  },
  reaction: {
    glow: 'drop-shadow-[0_0_4px_var(--color-reaction-purple)]',
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
    componentJobs?: {
      jobs: readonly { fee: { missingSystemCostIndex: boolean; missingAdjustedPriceTypeIds: readonly unknown[] } }[];
    } | null;
  } | null,
): MarginFigures {
  const showNet = net !== null;
  const margin = net !== null ? net.netMargin : (summary?.margin ?? null);
  const marginPct = net !== null ? net.netMarginPct : (summary?.marginPct ?? null);
  const fees = net ? [net.jobFee, ...(net.componentJobs?.jobs.map((job) => job.fee) ?? [])] : [];
  return {
    showNet,
    margin,
    marginPct,
    sign: margin !== null && margin > 0 ? '+' : '',
    missingSystemCostIndex: fees.some((fee) => fee.missingSystemCostIndex),
    missingAdjustedPriceCount: new Set(fees.flatMap((fee) => fee.missingAdjustedPriceTypeIds)).size,
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

export interface RowConfidence {
  level: ConfidenceLevel;
  reasons: string[];
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
