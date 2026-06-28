// Manual per-node time-efficiency (TE) overrides — the what-if layer on top of the
// owned-blueprint TE map (3.7.5.6), the time-side twin of the ME overrides. TE
// mirrors ME exactly: a per-blueprint level with a client-only override map that
// shadows the owned value, feeding the build-time engine's `teOf` seam. The
// effective-lookup and node-state logic are level-agnostic (a value + an override
// map), so they are SHARED from me-overrides under TE names rather than duplicated;
// only the cap differs — EVE time efficiency tops out at 20% (research level 10,
// 2% per level), where material efficiency tops out at 10.
import { effectiveMeOf, nodeMeState, type NodeMeState } from './me-overrides';

export const MAX_TE = 20;

// Clamp a raw numeric TE input to an integer in [0, MAX_TE]; a non-finite input
// (empty / malformed field) falls back to `fallback`. Same shape as `clampMe`.
export function clampTe(n: number, fallback = 0): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_TE, Math.max(0, Math.floor(n)));
}

// The effective per-blueprint TE lookup and a node's owned/manual/unowned state are
// identical in shape to ME (override wins, else owned, else undefined); re-exported
// so call sites read TE intent without a copy of the logic.
export const effectiveTeOf = effectiveMeOf;
export const nodeTeState = nodeMeState;
export type NodeTeState = NodeMeState;
