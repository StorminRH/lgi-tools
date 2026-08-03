// Pure dial vocabulary for the motion tuning group — the sibling of
// `map-controls-model.ts` on the motion side of the panel.
//
// Commit-time clamping keeps every dial inside its declared range and
// vocabulary (HC-3: three tiers, integer-percent overshoot, two flavors, two
// collapse weights), so an invalid config cannot leave the panel. All state
// lands in `MotionConfig`, never `LayoutConfig` (HC-4).
import { clampStepped } from '../canvas/map-controls-model';
import type {
  CollapseWeight,
  EdgeFlavor,
  MotionConfig,
} from './motion-contract';

/** Fast tier dial range (ms) — hover and micro feedback. */
export const FAST_TEMPO_RANGE = { min: 50, max: 500, step: 25 } as const;

/** Mid tier dial range (ms) — births, exits, and position glides. */
export const MID_TEMPO_RANGE = { min: 200, max: 1200, step: 50 } as const;

/** Slow tier dial range (ms) — camera moves and the heavy collapse exit. */
export const SLOW_TEMPO_RANGE = { min: 400, max: 2000, step: 100 } as const;

/** Overshoot dial range (integer percent of the travel). */
export const OVERSHOOT_RANGE = { min: 0, max: 40, step: 2 } as const;

/** Edge flavor options the segmented control exposes (PD-4). */
export const EDGE_FLAVOR_OPTIONS: readonly {
  readonly value: EdgeFlavor;
  readonly label: string;
}[] = [
  { value: 'fade-with-child', label: 'Fade' },
  { value: 'grow-from-parent', label: 'Grow' },
];

/** Collapse weight options the segmented control exposes (PD-3). */
export const COLLAPSE_WEIGHT_OPTIONS: readonly {
  readonly value: CollapseWeight;
  readonly label: string;
}[] = [
  { value: 'ordinary', label: 'Ordinary' },
  { value: 'heavy', label: 'Heavy' },
];

/** Commit a fast-tier dial change. */
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

/** Commit a mid-tier dial change. */
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

/** Commit a slow-tier dial change. */
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

/** Commit an overshoot dial change; integer percent by construction. */
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

/** Commit an edge-flavor segmented change. */
export function commitEdgeFlavor(
  config: MotionConfig,
  next: EdgeFlavor,
): MotionConfig {
  return { ...config, edgeFlavor: next };
}

/** Commit a collapse-weight segmented change. */
export function commitCollapseWeight(
  config: MotionConfig,
  next: CollapseWeight,
): MotionConfig {
  return { ...config, collapseWeight: next };
}
