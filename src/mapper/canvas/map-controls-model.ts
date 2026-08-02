// Pure dial vocabulary for the map tuning panel.
//
// Commit-time clamping keeps the standing invariant `ringSpacing ≥ minSeparation`
// from either direction. Presets resolve to `DIRECTION_PRESETS` so the panel
// never grows a second owner of the heading vocabulary.
import {
  DIRECTION_PRESETS,
  type DirectionPresetId,
  type LayoutConfig,
  type WedgePolicy,
} from '../layout/layout-contract';

/** Ring spacing dial range (canvas units). */
export const RING_SPACING_RANGE = { min: 140, max: 480, step: 10 } as const;

/** Minimum separation dial range (canvas units). */
export const MIN_SEPARATION_RANGE = { min: 80, max: 240, step: 10 } as const;

/** Sibling fan dial range. */
export const SIBLING_SPREAD_RANGE = { min: 1, max: 6, step: 1 } as const;

/** Wedge posture options the segmented control exposes. */
export const WEDGE_POLICY_OPTIONS: readonly {
  readonly value: WedgePolicy;
  readonly label: string;
}[] = [
  { value: 'fixed-slot', label: 'Fixed' },
  { value: 'proportional', label: 'Proportional' },
];

/** Direction preset options the segmented control exposes. */
export const DIRECTION_PRESET_OPTIONS: readonly {
  readonly value: DirectionPresetId;
  readonly label: string;
}[] = [
  { value: 'compass-8', label: 'Compass 8' },
  { value: 'cardinal-4', label: 'Cardinal 4' },
  { value: 'diagonals-first-8', label: 'Diagonals first' },
  { value: 'rotated-45', label: 'Rotated 45°' },
];

/** Clamp a number into `[min, max]` and snap to `step` from `min`. */
function clampStepped(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  return min + steps * step;
}

/**
 * Commit a ring-spacing dial change: clamp to range, then raise the floor of
 * separation so `ringSpacing ≥ minSeparation` still holds.
 */
export function commitRingSpacing(
  config: LayoutConfig,
  next: number,
): LayoutConfig {
  const ringSpacing = clampStepped(
    next,
    RING_SPACING_RANGE.min,
    RING_SPACING_RANGE.max,
    RING_SPACING_RANGE.step,
  );
  const minSeparation = Math.min(config.minSeparation, ringSpacing);
  return { ...config, ringSpacing, minSeparation };
}

/**
 * Commit a min-separation dial change: clamp to range, then raise ring spacing
 * when needed so `ringSpacing ≥ minSeparation` still holds.
 */
export function commitMinSeparation(
  config: LayoutConfig,
  next: number,
): LayoutConfig {
  const minSeparation = clampStepped(
    next,
    MIN_SEPARATION_RANGE.min,
    MIN_SEPARATION_RANGE.max,
    MIN_SEPARATION_RANGE.step,
  );
  const ringSpacing = Math.max(config.ringSpacing, minSeparation);
  return { ...config, ringSpacing, minSeparation };
}

/** Commit a sibling-fan dial change. */
export function commitSiblingSpread(
  config: LayoutConfig,
  next: number,
): LayoutConfig {
  return {
    ...config,
    siblingSpread: clampStepped(
      next,
      SIBLING_SPREAD_RANGE.min,
      SIBLING_SPREAD_RANGE.max,
      SIBLING_SPREAD_RANGE.step,
    ),
  };
}

/** Commit a wedge-posture segmented change. */
export function commitWedgePolicy(
  config: LayoutConfig,
  next: WedgePolicy,
): LayoutConfig {
  return { ...config, wedgePolicy: next };
}

/** Commit a direction-order preset; resolves through `DIRECTION_PRESETS`. */
export function commitDirectionPreset(
  config: LayoutConfig,
  preset: DirectionPresetId,
): LayoutConfig {
  return { ...config, directionSequence: DIRECTION_PRESETS[preset] };
}

/** Which preset matches the current direction sequence, if any. */
export function directionPresetOf(
  config: LayoutConfig,
): DirectionPresetId | null {
  for (const [id, sequence] of Object.entries(DIRECTION_PRESETS) as [
    DirectionPresetId,
    readonly number[],
  ][]) {
    if (
      sequence.length === config.directionSequence.length &&
      sequence.every((heading, index) => heading === config.directionSequence[index])
    ) {
      return id;
    }
  }
  return null;
}
