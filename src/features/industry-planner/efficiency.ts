export const MAX_ME = 10;
export const MAX_TE = 20;

function clampTo(max: number): (n: number) => number {
  return (n) => {
    if (!Number.isFinite(n)) return 0;
    return Math.min(max, Math.max(0, Math.floor(n)));
  };
}

/** Module-level instances, so useOverrideSetters' useCallback deps keep one reference across renders. */
export const clampMe = clampTo(MAX_ME);
export const clampTe = clampTo(MAX_TE);

/** A manual override wins, even at 0; otherwise the owned copy's research, if any. Serves ME and TE alike. */
export function effectiveEfficiencyOf(
  owned: Map<number, number> | null,
  overrides: Map<number, number>,
): (blueprintTypeId: number) => number | undefined {
  return (blueprintTypeId) =>
    overrides.has(blueprintTypeId)
      ? overrides.get(blueprintTypeId)
      : owned?.get(blueprintTypeId);
}

export type EfficiencyState = 'owned' | 'manual' | 'unowned';

/** The ME or TE glyph: owned only when the held copy is researched (above 0) in that attribute. */
export function efficiencyGlyphState(
  owned: number | undefined,
  override: number | undefined,
): EfficiencyState {
  if (override !== undefined) return 'manual';
  if (owned !== undefined && owned > 0) return 'owned';
  return 'unowned';
}

/**
 * The node frame: owned when any copy is held, whatever its research. An ME0/TE0 copy
 * therefore wears the owned frame while its glyphs stay muted (see efficiencyGlyphState).
 */
export function nodeFrameState(
  blueprintTypeId: number,
  ownedMe: Map<number, number> | null,
  ownedTe: Map<number, number> | null,
  meOverrides: Map<number, number>,
  teOverrides: Map<number, number>,
): EfficiencyState {
  if (meOverrides.has(blueprintTypeId) || teOverrides.has(blueprintTypeId)) return 'manual';
  if (ownedMe?.has(blueprintTypeId) || ownedTe?.has(blueprintTypeId)) return 'owned';
  return 'unowned';
}

/** The material (ME) or time (TE) multiplier for a research percentage; 0 or below leaves the base whole. */
export function efficiencyFactor(pct: number): number {
  return pct <= 0 ? 1 : 1 - pct / 100;
}

export function setOverride(
  current: Map<number, number>,
  blueprintTypeId: number,
  value: number,
  clamp: (value: number) => number,
): Map<number, number> {
  return new Map(current).set(blueprintTypeId, clamp(value));
}

export function resetOverride(
  current: Map<number, number>,
  blueprintTypeId: number,
): Map<number, number> {
  if (!current.has(blueprintTypeId)) return current;
  const next = new Map(current);
  next.delete(blueprintTypeId);
  return next;
}
