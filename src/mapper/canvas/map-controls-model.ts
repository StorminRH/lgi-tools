// Pure dial vocabulary for the map tuning panel.
//
// Commit-time clamping keeps the standing invariant `ringSpacing ≥ minSeparation`
// from either direction. Presets resolve to `DIRECTION_PRESETS` so the panel
// never grows a second owner of the heading vocabulary. The halo/fog groups
// (4.0.4.2.3 OW4) are G-1 tuning dials over the pinned constants — the panel
// is dev-only, so production always renders the pins.
import type { FogConfig } from '../fog/fog-model';
import type { HaloLimits } from '../halo/halo-model';
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

/**
 * Clamp a number into `[min, max]` and snap to `step` from `min`. Shared with
 * the motion dial model (`motion-controls-model.ts`), its second consumer.
 */
export function clampStepped(
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
 * Commit a ring-spacing dial change: clamp to range, then lower `minSeparation`
 * to the new `ringSpacing` when needed so `ringSpacing ≥ minSeparation` still holds.
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

/** Halo drawn-ring depth dial range. */
export const HALO_DRAWN_RINGS_RANGE = { min: 0, max: 4, step: 1 } as const;

/** Halo fogged-ring depth dial range. */
export const HALO_FOGGED_RINGS_RANGE = { min: 0, max: 2, step: 1 } as const;

/** Halo per-exit system cap dial range. */
export const HALO_PER_EXIT_RANGE = { min: 10, max: 120, step: 10 } as const;

/** Halo aggregate system cap dial range. */
export const HALO_TOTAL_RANGE = { min: 30, max: 300, step: 30 } as const;

/** Commit a halo drawn-ring dial change. */
export function commitHaloDrawnRings(limits: HaloLimits, next: number): HaloLimits {
  const range = HALO_DRAWN_RINGS_RANGE;
  return { ...limits, drawnRings: clampStepped(next, range.min, range.max, range.step) };
}

/** Commit a halo fogged-ring dial change. */
export function commitHaloFoggedRings(limits: HaloLimits, next: number): HaloLimits {
  const range = HALO_FOGGED_RINGS_RANGE;
  return { ...limits, foggedRings: clampStepped(next, range.min, range.max, range.step) };
}

/** Commit a halo per-exit cap dial change. */
export function commitHaloPerExitCap(limits: HaloLimits, next: number): HaloLimits {
  const range = HALO_PER_EXIT_RANGE;
  return {
    ...limits,
    maxSystemsPerExit: clampStepped(next, range.min, range.max, range.step),
  };
}

/** Commit a halo aggregate cap dial change. */
export function commitHaloTotalCap(limits: HaloLimits, next: number): HaloLimits {
  const range = HALO_TOTAL_RANGE;
  return {
    ...limits,
    maxSystemsTotal: clampStepped(next, range.min, range.max, range.step),
  };
}

/** Fog reveal-radius dial range (world units). */
export const FOG_REVEAL_RADIUS_RANGE = { min: 80, max: 320, step: 10 } as const;

/** Fog corridor-radius dial range (world units). */
export const FOG_STROKE_RADIUS_RANGE = { min: 20, max: 120, step: 4 } as const;

/** Fog cloud-density dial range, in percent. */
export const FOG_OPACITY_PCT_RANGE = { min: 40, max: 100, step: 5 } as const;

/** Fog tier options the segmented control exposes. */
export const FOG_TIER_OPTIONS: readonly {
  readonly value: FogConfig['tier'];
  readonly label: string;
}[] = [
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'static', label: 'Static' },
];

/** Commit a fog reveal-radius dial change. */
export function commitFogRevealRadius(config: FogConfig, next: number): FogConfig {
  const range = FOG_REVEAL_RADIUS_RANGE;
  return { ...config, revealRadius: clampStepped(next, range.min, range.max, range.step) };
}

/** Commit a fog corridor-radius dial change. */
export function commitFogStrokeRadius(config: FogConfig, next: number): FogConfig {
  const range = FOG_STROKE_RADIUS_RANGE;
  return { ...config, strokeRadius: clampStepped(next, range.min, range.max, range.step) };
}

/** Commit a fog density dial change (percent in, fraction stored). */
export function commitFogOpacityPct(config: FogConfig, next: number): FogConfig {
  const range = FOG_OPACITY_PCT_RANGE;
  return {
    ...config,
    opacity: clampStepped(next, range.min, range.max, range.step) / 100,
  };
}

/** Commit a fog tier segmented change. */
export function commitFogTier(config: FogConfig, tier: FogConfig['tier']): FogConfig {
  return { ...config, tier };
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
