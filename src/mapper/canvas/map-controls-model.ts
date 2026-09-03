import type { FogConfig } from '../fog/fog-model';
import type { HaloLimits } from '../halo/halo-model';
import {
  DIRECTION_PRESETS,
  type DirectionPresetId,
  type LayoutConfig,
  type WedgePolicy,
} from '../layout/layout-contract';

export const RING_SPACING_RANGE = { min: 140, max: 480, step: 10 } as const;

export const MIN_SEPARATION_RANGE = { min: 80, max: 240, step: 10 } as const;

export const SIBLING_SPREAD_RANGE = { min: 1, max: 6, step: 1 } as const;

export const WEDGE_POLICY_OPTIONS: readonly {
  readonly value: WedgePolicy;
  readonly label: string;
}[] = [
  { value: 'fixed-slot', label: 'Fixed' },
  { value: 'proportional', label: 'Proportional' },
];

export const DIRECTION_PRESET_OPTIONS: readonly {
  readonly value: DirectionPresetId;
  readonly label: string;
}[] = [
  { value: 'compass-8', label: 'Compass 8' },
  { value: 'cardinal-4', label: 'Cardinal 4' },
  { value: 'diagonals-first-8', label: 'Diagonals first' },
  { value: 'rotated-45', label: 'Rotated 45°' },
];

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

export function commitWedgePolicy(
  config: LayoutConfig,
  next: WedgePolicy,
): LayoutConfig {
  return { ...config, wedgePolicy: next };
}

export function commitDirectionPreset(
  config: LayoutConfig,
  preset: DirectionPresetId,
): LayoutConfig {
  return { ...config, directionSequence: DIRECTION_PRESETS[preset] };
}

export const HALO_DRAWN_RINGS_RANGE = { min: 0, max: 4, step: 1 } as const;

export const HALO_FOGGED_RINGS_RANGE = { min: 0, max: 2, step: 1 } as const;

export const HALO_PER_EXIT_RANGE = { min: 10, max: 120, step: 10 } as const;

export const HALO_TOTAL_RANGE = { min: 30, max: 300, step: 30 } as const;

export function commitHaloDrawnRings(limits: HaloLimits, next: number): HaloLimits {
  const range = HALO_DRAWN_RINGS_RANGE;
  return { ...limits, drawnRings: clampStepped(next, range.min, range.max, range.step) };
}

export function commitHaloFoggedRings(limits: HaloLimits, next: number): HaloLimits {
  const range = HALO_FOGGED_RINGS_RANGE;
  return { ...limits, foggedRings: clampStepped(next, range.min, range.max, range.step) };
}

export function commitHaloPerExitCap(limits: HaloLimits, next: number): HaloLimits {
  const range = HALO_PER_EXIT_RANGE;
  return {
    ...limits,
    maxSystemsPerExit: clampStepped(next, range.min, range.max, range.step),
  };
}

export function commitHaloTotalCap(limits: HaloLimits, next: number): HaloLimits {
  const range = HALO_TOTAL_RANGE;
  return {
    ...limits,
    maxSystemsTotal: clampStepped(next, range.min, range.max, range.step),
  };
}

export const FOG_REVEAL_RADIUS_RANGE = { min: 80, max: 320, step: 10 } as const;

export const FOG_STROKE_RADIUS_RANGE = { min: 20, max: 120, step: 4 } as const;

export const FOG_OPACITY_PCT_RANGE = { min: 40, max: 100, step: 5 } as const;

export const FOG_TIER_OPTIONS: readonly {
  readonly value: FogConfig['tier'];
  readonly label: string;
}[] = [
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'static', label: 'Static' },
];

export function commitFogRevealRadius(config: FogConfig, next: number): FogConfig {
  const range = FOG_REVEAL_RADIUS_RANGE;
  return { ...config, revealRadius: clampStepped(next, range.min, range.max, range.step) };
}

export function commitFogStrokeRadius(config: FogConfig, next: number): FogConfig {
  const range = FOG_STROKE_RADIUS_RANGE;
  return { ...config, strokeRadius: clampStepped(next, range.min, range.max, range.step) };
}

export function commitFogOpacityPct(config: FogConfig, next: number): FogConfig {
  const range = FOG_OPACITY_PCT_RANGE;
  return {
    ...config,
    opacity: clampStepped(next, range.min, range.max, range.step) / 100,
  };
}

export function commitFogTier(config: FogConfig, tier: FogConfig['tier']): FogConfig {
  return { ...config, tier };
}

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
