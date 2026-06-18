import { MANUFACTURING_ACTIVITY_ID } from './build-pricing';
import type { BlueprintPricing, NetMarginView } from './types';

// Shared margin/ledger derivation for the Cockpit — the one place the KPI margin
// tile and the profit ledger agree on which cost basis is in play, so the two can
// never drift. Pure (no React); the components feed it the live store's values.

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

export interface LedgerFigures {
  cost: number | null; // net cost (incl. top-job install fee) in net mode, else raw input cost
  revenue: number | null;
  profit: number | null; // revenue − cost, PRE-sell-fee (≠ the KPI net margin)
  costPct: number; // cost share of revenue, clamped to [0, 100]
}

// Profit ledger figures from the summary + the selected net view.
export function deriveLedger(
  summary: BlueprintPricing['summary'] | null,
  net: NetMarginView | null,
): LedgerFigures {
  const cost = net?.netCost ?? summary?.inputCost ?? null;
  const revenue = summary?.revenue ?? null;
  const profit = cost !== null && revenue !== null ? revenue - cost : null;
  const frac =
    cost !== null && revenue !== null && revenue > 0 ? Math.min(1, Math.max(0, cost / revenue)) : 0;
  return { cost, revenue, profit, costPct: Math.round(frac * 100) };
}
