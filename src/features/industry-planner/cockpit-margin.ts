import { isProductionActivity } from './structure-bonus';
import type { BlueprintPricing, NetMarginView } from './types';

export type MarginMode = 'gross' | 'net';

export function selectNet(
  pricing: BlueprintPricing | null,
  activityId: number,
  hasFeeSource: boolean,
  marginMode: MarginMode,
): { net: NetMarginView | null; netAvailable: boolean } {
  const feeableActivity = isProductionActivity(activityId);
  const netAvailable = feeableActivity && hasFeeSource;
  const net = netAvailable && marginMode === 'net' ? (pricing?.net ?? null) : null;
  return { net, netAvailable };
}
