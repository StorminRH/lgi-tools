import { effectiveMeOf, nodeMeState, type NodeMeState } from './me-overrides';

export const MAX_TE = 20;

export function clampTe(n: number, fallback = 0): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_TE, Math.max(0, Math.floor(n)));
}

export function effectiveTeOf(
  owned: Map<number, number> | null,
  overrides: Map<number, number>,
): (blueprintTypeId: number) => number | undefined {
  return effectiveMeOf(owned, overrides);
}

export function nodeTeState(owned: number | undefined, override: number | undefined): NodeMeState {
  return nodeMeState(owned, override);
}
