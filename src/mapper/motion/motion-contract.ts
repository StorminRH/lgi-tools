export interface MotionTempo {
  readonly fast: number;
  readonly mid: number;
  readonly slow: number;
}

export type MotionPhase = 'entering' | 'departing';

export type NodeMotion = {
  readonly phase: MotionPhase;
  readonly heavy?: boolean;
};

export type EdgeMotion = {
  readonly phase: MotionPhase;
  readonly flavor: 'fade' | 'grow';
  readonly reverse: boolean;
  readonly heavy: boolean;
};

export type EdgeFlavor = 'fade-with-child' | 'grow-from-parent';

export type CollapseWeight = 'ordinary' | 'heavy';

export interface MotionConfig {
  readonly tempo: MotionTempo;
  readonly overshootPct: number;
  readonly edgeFlavor: EdgeFlavor;
  readonly collapseWeight: CollapseWeight;
}

export const DEFAULT_MOTION_CONFIG: MotionConfig = {
  tempo: { fast: 250, mid: 1000, slow: 1000 },
  overshootPct: 12,
  edgeFlavor: 'grow-from-parent',
  collapseWeight: 'ordinary',
};

export interface SpringFamily {
  readonly ease: (t: number) => number;
  readonly cssLinear: string;
}

const CSS_SAMPLE_COUNT = 24;

const MAX_OVERSHOOT_FRACTION = 0.6;

function backFactorFor(fraction: number): number {
  if (fraction <= 0) return 0;
  const peak = (s: number) => (4 * s ** 3) / (27 * (s + 1) ** 2);
  let low = 0;
  let high = 30;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    if (peak(mid) < fraction) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function springFamily(overshootPct: number): SpringFamily {
  const fraction = Math.min(
    MAX_OVERSHOOT_FRACTION,
    Math.max(0, overshootPct / 100),
  );
  const s = backFactorFor(fraction);
  const ease = (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const u = t - 1;
    return 1 + (s + 1) * u ** 3 + s * u ** 2;
  };
  const stops = Array.from({ length: CSS_SAMPLE_COUNT + 1 }, (_, index) =>
    Number(ease(index / CSS_SAMPLE_COUNT).toFixed(4)),
  );
  return { ease, cssLinear: `linear(${stops.join(', ')})` };
}

export function motionCssProperties(
  config: MotionConfig,
): Readonly<Record<string, string>> {
  return {
    '--map-motion-fast': `${config.tempo.fast}ms`,
    '--map-motion-mid': `${config.tempo.mid}ms`,
    '--map-motion-slow': `${config.tempo.slow}ms`,
    '--map-motion-ease': springFamily(config.overshootPct).cssLinear,
    '--map-motion-ease-settle': springFamily(0).cssLinear,
  };
}

export interface TweenPlan {
  readonly ease: (t: number) => number;
  readonly moveMs: number;
  readonly birthMs: number;
  readonly exitMs: number;
  readonly heavyExitMs: number;
  readonly collapseHeavy: boolean;
}

export function tweenPlanOf(
  config: MotionConfig,
  reducedMotion: boolean,
): TweenPlan {
  return {
    ease: springFamily(config.overshootPct).ease,
    moveMs: reducedMotion ? 0 : config.tempo.mid,
    birthMs: config.tempo.mid,
    exitMs: config.tempo.mid,
    heavyExitMs: config.tempo.slow,
    collapseHeavy: config.collapseWeight === 'heavy',
  };
}

export type PrefersReducedMotion = () => boolean;

export function browserPrefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
