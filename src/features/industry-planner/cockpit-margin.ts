import { MANUFACTURING_ACTIVITY_ID } from './build-pricing';
import type { BlueprintPricing, NetMarginView } from './types';

// Shared margin selection for the Cockpit — the one place the KPI margin tile
// decides which cost basis (gross vs net) is in play. Pure (no React); the
// component feeds it the live store's values.

export type MarginMode = 'gross' | 'net';

// The net-margin view to use, honoring the user's gross/net preference. Net is
// available only for a manufacturing blueprint with a build location picked; the
// caller passes `hasLocation` so this stays free of the pricing-store hook.
export function selectNet(
  pricing: BlueprintPricing | null,
  activityId: number,
  hasLocation: boolean,
  marginMode: MarginMode,
): { net: NetMarginView | null; netAvailable: boolean } {
  const netAvailable = activityId === MANUFACTURING_ACTIVITY_ID && hasLocation;
  const net = netAvailable && marginMode === 'net' ? (pricing?.net ?? null) : null;
  return { net, netAvailable };
}
