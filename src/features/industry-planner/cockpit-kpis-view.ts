import { formatIsk } from '@/lib/format/isk';
import { selectNet, type MarginMode } from './cockpit-margin';
import {
  deriveMarginFigures,
  regionalDiscountCallout,
  sellAnchorConfidence,
  type RegionalDiscountCallout,
} from './industry-styles';
import { REACTION_ACTIVITY } from './structure-bonus';
import type { BlueprintPricing, NetMarginView } from './types';

export interface CockpitMarginView {
  net: NetMarginView | null;
  netAvailable: boolean;
  showNet: boolean;
  margin: number | null;
  marginPct: number | null;
  sign: string;
  feeSystemName: string | undefined;
  marginLabel: string;
}

export function cockpitMarginView(
  pricing: BlueprintPricing | null,
  activityId: number,
  location: { systemName: string } | null,
  reactionSystem: { systemName: string } | null,
  reactionNetAvailable: boolean,
  marginMode: MarginMode,
): CockpitMarginView {
  const isReaction = activityId === REACTION_ACTIVITY;
  const { net, netAvailable } = selectNet(
    pricing,
    activityId,
    isReaction ? reactionNetAvailable : location !== null,
    marginMode,
  );
  const { showNet, margin, marginPct, sign } = deriveMarginFigures(pricing?.summary ?? null, net);
  return {
    net,
    netAvailable,
    showNet,
    margin,
    marginPct,
    sign,

    feeSystemName: isReaction && reactionSystem ? reactionSystem.systemName : location?.systemName,
    marginLabel: showNet ? 'Net margin' : 'Gross margin',
  };
}

export interface SellTileView {
  thinAnchor: ReturnType<typeof sellAnchorConfidence>;
  discount: RegionalDiscountCallout | null;
  hasBadge: boolean;
  revenue: string;
}

export function sellTileView(pricing: BlueprintPricing | null): SellTileView {
  const thinAnchor = pricing ? sellAnchorConfidence(pricing.product) : null;
  const discount = pricing ? regionalDiscountCallout(pricing.product) : null;
  return {
    thinAnchor,
    discount,
    hasBadge: thinAnchor !== null || discount !== null,
    revenue: pricing?.summary ? formatIsk(pricing.summary.revenue) : '—',
  };
}

export interface InputCostView {
  bases: { batched: number; marginal: number } | null;
  inputCost: string;
}

export function inputCostView(pricing: BlueprintPricing | null): InputCostView {
  const summary = pricing?.summary ?? null;
  return {
    bases: summary?.bases ?? null,
    inputCost: summary ? formatIsk(summary.inputCost) : '—',
  };
}

export function indefiniteArticleForPct(pct: number): 'a' | 'an' {
  return pct === 8 || pct === 11 || pct === 18 || (pct >= 80 && pct <= 89) ? 'an' : 'a';
}
