// Manual per-node material-efficiency (ME) overrides — the what-if layer on top
// of the owned-blueprint ME map (3.7.5.4). An override is a client-only,
// non-persisted value keyed by the producing blueprint's type id; it SHADOWS the
// owned ME for that blueprint, feeding the very same `meOf` seam the owned-ME
// transform uses (`computeBatchLedgerWithMe`). With no overrides set the effective
// ME is the owned ME unchanged, so the plan stays byte-identical to the
// owned-only path. Pure functions only — no React, no fetch, no persistence — so
// every adjuster variant (and the eventual planner wiring) shares one behaviour.

// EVE's manufacturing material efficiency caps at research level 10. The override
// input clamps to this range so a stray keystroke or stepper can't drive the
// engine out of bounds (the engine itself tolerates other values, but EVE never
// produces them).
export const MAX_ME = 10;

// Clamp a raw numeric ME input to an integer in [0, MAX_ME]. A non-finite input
// (NaN / Infinity from an empty or malformed field) falls back to `fallback`.
// Mirrors the shape of PricingProvider's `setRuns` clamp.
export function clampMe(n: number, fallback = 0): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_ME, Math.max(0, Math.floor(n)));
}

// The effective per-blueprint ME lookup: a manual override wins wherever one is
// set (even an explicit 0 — a deliberate "model this at ME0" what-if), otherwise
// the owned ME, otherwise undefined (an unowned blueprint → ME0 in the engine).
// With an empty override map this is `owned.get` exactly, which is what makes the
// ledger byte-identical to the owned-only path. `owned` may be null (the owned
// read hasn't settled yet).
export function effectiveMeOf(
  owned: Map<number, number> | null,
  overrides: Map<number, number>,
): (blueprintTypeId: number) => number | undefined {
  return (blueprintTypeId) =>
    overrides.has(blueprintTypeId)
      ? overrides.get(blueprintTypeId)
      : owned?.get(blueprintTypeId);
}

// How a node's ME should read, so a manual value never masquerades as owned:
//   'manual'  — an override is set (a what-if value, shown in its own tone)
//   'owned'   — no override, and the player owns a researched (ME > 0) copy
//   'unowned' — no override, nothing owned (or only an unresearched ME0 copy)
// Drives the adjuster's tone and its honest baseline label.
export type NodeMeState = 'owned' | 'manual' | 'unowned';

export function nodeMeState(
  owned: number | undefined,
  override: number | undefined,
): NodeMeState {
  if (override !== undefined) return 'manual';
  if (owned !== undefined && owned > 0) return 'owned';
  return 'unowned';
}
