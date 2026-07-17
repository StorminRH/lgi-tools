// The ME/TE efficiency field's pure input math (extracted from MeAdjuster's
// EfficiencyField so the validation/clamp/shown decisions are unit-tested; the
// draft/wheel/focus state stays in the component — it's genuinely interactive).

/**
 * Validate a typed efficiency value: a whole number in [0, max], else null (the
 * caller keeps the raw draft but doesn't commit an invalid one).
 */
export function parseEfficiencyInput(raw: string, max: number): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

/**
 * Step the effective value by delta, clamped to [0, max] (the ↑/↓ keys, the +/−
 * buttons, and the wheel all share this).
 */
export function stepValue(current: number, delta: number, max: number): number {
  return Math.min(max, Math.max(0, current + delta));
}

/**
 * The field's shown string: empty when the node is unowned and unset (the
 * placeholder shows), else the effective number.
 */
export function shownEfficiency(state: string, isOverridden: boolean, effective: number): string {
  return state === 'unowned' && !isOverridden ? '' : String(effective);
}

/** The step delta for an arrow key: +1 up, −1 down, 0 for anything else (no step). */
export function arrowStep(key: string): number {
  if (key === 'ArrowUp') return 1;
  if (key === 'ArrowDown') return -1;
  return 0;
}
