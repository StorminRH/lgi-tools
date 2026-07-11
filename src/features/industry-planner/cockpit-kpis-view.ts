// Pure view logic for the Cockpit KPI row (CockpitKpis), extracted so the margin
// source selection, the fee-system naming, and the tile derivations are
// unit-tested and the tiles stay render shells. Composes the existing pure
// mappers (selectNet, deriveMarginFigures, the confidence/discount verdicts).

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

// The margin tile's derived state: the net figures (net path only), the gross↔net
// figures the tile shows, the fee-bearing system name for the hover, and the tile
// label. The net-availability source is activity-matched — a reaction blueprint's
// fee rides the reaction slot (or a build-slot refinery), not the build location.
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
    // The hover names the fee-bearing system: the reaction system for a reaction
    // blueprint (falling back to the build system when a build-slot refinery is
    // the fee source), else the build system.
    feeSystemName: isReaction && reactionSystem ? reactionSystem.systemName : location?.systemName,
    marginLabel: showNet ? 'Net margin' : 'Gross margin',
  };
}

// The Sell·Jita tile's derived state: the thin-order badge verdict, the regional
// discount opportunity, whether either badge shows, and the revenue figure.
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

// The Input-cost tile's derived state: both cost bases for the popover, and the
// active input-cost figure (the summary carries its own basis stamp).
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

// "an 8%/11%/18%/80–89% discount" — the only integers ≤ 100 spoken with a vowel.
export function indefiniteArticleForPct(pct: number): 'a' | 'an' {
  return pct === 8 || pct === 11 || pct === 18 || (pct >= 80 && pct <= 89) ? 'an' : 'a';
}
