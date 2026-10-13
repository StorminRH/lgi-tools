/** Clamp into [min, max]. When max is below min, min wins. NaN passes through. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clampPct(value: number): number {
  return clamp(value, 0, 100);
}

/** Round half up to `places` decimals, bit-identical to Math.round(v * 10^n) / 10^n. */
export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** ISK to the cent, as stored in net-worth rows and journal series. */
export function roundIsk(value: number): number {
  return roundTo(value, 2);
}
