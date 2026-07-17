import { MANUFACTURING_ACTIVITY_ID } from './build-pricing';
import { REACTION_ACTIVITY } from './structure-bonus';
import type { BlueprintPricing, NetMarginView } from './types';

// Shared margin selection for the Cockpit — the one place the KPI margin tile
// decides which cost basis (gross vs net) is in play. Pure (no React); the
// component feeds it the live store's values.

export type MarginMode = 'gross' | 'net';

/**
 * The net-margin view to use, honoring the user's gross/net preference. Net is
 * available for a manufacturing blueprint with a build location picked, or a
 * reaction blueprint with a reaction fee source (3.7.13.3 — its own reaction
 * system, or a build-slot refinery). The caller passes the activity-matched
 * `hasFeeSource` so this stays free of the pricing-store hook.
 */
export function selectNet(
  pricing: BlueprintPricing | null,
  activityId: number,
  hasFeeSource: boolean,
  marginMode: MarginMode,
): { net: NetMarginView | null; netAvailable: boolean } {
  const feeableActivity =
    activityId === MANUFACTURING_ACTIVITY_ID || activityId === REACTION_ACTIVITY;
  const netAvailable = feeableActivity && hasFeeSource;
  const net = netAvailable && marginMode === 'net' ? (pricing?.net ?? null) : null;
  return { net, netAvailable };
}
