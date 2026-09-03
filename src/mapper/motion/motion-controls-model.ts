import { clampStepped } from '../canvas/map-controls-model';
import type {
  CollapseWeight,
  EdgeFlavor,
  MotionConfig,
} from './motion-contract';

export const FAST_TEMPO_RANGE = { min: 50, max: 500, step: 25 } as const;

export const MID_TEMPO_RANGE = { min: 200, max: 1200, step: 50 } as const;

export const SLOW_TEMPO_RANGE = { min: 400, max: 2000, step: 100 } as const;

export const OVERSHOOT_RANGE = { min: 0, max: 40, step: 2 } as const;

export const EDGE_FLAVOR_OPTIONS: readonly {
  readonly value: EdgeFlavor;
  readonly label: string;
}[] = [
  { value: 'fade-with-child', label: 'Fade' },
  { value: 'grow-from-parent', label: 'Grow' },
];

export const COLLAPSE_WEIGHT_OPTIONS: readonly {
  readonly value: CollapseWeight;
  readonly label: string;
}[] = [
  { value: 'ordinary', label: 'Ordinary' },
  { value: 'heavy', label: 'Heavy' },
];

export function commitFastTempo(config: MotionConfig, next: number): MotionConfig {
  return {
    ...config,
    tempo: {
      ...config.tempo,
      fast: clampStepped(
        next,
        FAST_TEMPO_RANGE.min,
        FAST_TEMPO_RANGE.max,
        FAST_TEMPO_RANGE.step,
      ),
    },
  };
}

export function commitMidTempo(config: MotionConfig, next: number): MotionConfig {
  return {
    ...config,
    tempo: {
      ...config.tempo,
      mid: clampStepped(
        next,
        MID_TEMPO_RANGE.min,
        MID_TEMPO_RANGE.max,
        MID_TEMPO_RANGE.step,
      ),
    },
  };
}

export function commitSlowTempo(config: MotionConfig, next: number): MotionConfig {
  return {
    ...config,
    tempo: {
      ...config.tempo,
      slow: clampStepped(
        next,
        SLOW_TEMPO_RANGE.min,
        SLOW_TEMPO_RANGE.max,
        SLOW_TEMPO_RANGE.step,
      ),
    },
  };
}

export function commitOvershoot(config: MotionConfig, next: number): MotionConfig {
  return {
    ...config,
    overshootPct: clampStepped(
      next,
      OVERSHOOT_RANGE.min,
      OVERSHOOT_RANGE.max,
      OVERSHOOT_RANGE.step,
    ),
  };
}

export function commitEdgeFlavor(
  config: MotionConfig,
  next: EdgeFlavor,
): MotionConfig {
  return { ...config, edgeFlavor: next };
}

export function commitCollapseWeight(
  config: MotionConfig,
  next: CollapseWeight,
): MotionConfig {
  return { ...config, collapseWeight: next };
}
