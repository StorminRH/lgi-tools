export const MAX_ME = 10;

export function clampMe(n: number, fallback = 0): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_ME, Math.max(0, Math.floor(n)));
}

export function effectiveMeOf(
  owned: Map<number, number> | null,
  overrides: Map<number, number>,
): (blueprintTypeId: number) => number | undefined {
  return (blueprintTypeId) =>
    overrides.has(blueprintTypeId)
      ? overrides.get(blueprintTypeId)
      : owned?.get(blueprintTypeId);
}

export type NodeMeState = 'owned' | 'manual' | 'unowned';

export function nodeMeState(
  owned: number | undefined,
  override: number | undefined,
): NodeMeState {
  if (override !== undefined) return 'manual';
  if (owned !== undefined && owned > 0) return 'owned';
  return 'unowned';
}
