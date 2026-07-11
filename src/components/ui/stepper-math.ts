type StepperBounds = { min: number; max?: number };

// Decide whether a typed/blurred field value commits: it must be a whole number
// within [min, max]. Returns the number to commit, or null when the draft is
// empty or out of range (the field is left as-is until blur snaps it back).
// `max` omitted = no upper bound (the runs case).
export function commitStepperValue(raw: string, { min, max }: StepperBounds): number | null {
  const n = Number(raw);
  if (raw !== '' && Number.isInteger(n) && n >= min && (max === undefined || n <= max)) {
    return n;
  }
  return null;
}

// Clamp a −/+ button step to the bounds so it no-ops rather than overshoot.
// `max` omitted = no upper bound.
export function clampStep(value: number, delta: number, { min, max }: StepperBounds): number {
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, value + delta));
}
