// The one owner of the motion vocabulary (contract HC-3): the dial config, the
// three duration tiers, the spring easing family, and the reduced-motion seam.
//
// One easing family, defined exactly once: `springFamily` is the sampled spring
// both worlds consume — the JS function drives the position-tween scheduler, and
// the CSS `linear()` token generated from the very same samples drives the
// stylesheet birth/exit animations. A unit test pins their agreement, so the
// canvas cannot develop two subtly different springs.
//
// Motion state is presentation-only (contract HC-4): nothing here reaches
// Convex, `LayoutConfig`, or any synchronized state.

/**
 * The three duration tiers, in milliseconds — all operator dials (HC-3).
 *
 * Tier semantics are fixed even as the values move: `fast` drives hover and
 * micro feedback, `mid` drives births, exits, and position glides, `slow`
 * drives camera moves.
 */
export interface MotionTempo {
  readonly fast: number;
  readonly mid: number;
  readonly slow: number;
}

/** How a departing edge leaves (and an arriving tree edge enters) the canvas. */
export type EdgeFlavor = 'fade-with-child' | 'grow-from-parent';

/** Whether a chain collapse plays a heavier departure than a single removal. */
export type CollapseWeight = 'ordinary' | 'heavy';

/**
 * The motion dial set. Deliberately a separate object from `LayoutConfig`:
 * motion never feeds layout (HC-4), and the exhaustive `layoutConfigKey`
 * fingerprint proves no motion field can slip in there. `focusOnClick` is
 * deliberately NOT a member — it is a shipped user setting beside camera
 * follow, not an operator tuning dial.
 */
export interface MotionConfig {
  readonly tempo: MotionTempo;
  /** Glide/birth overshoot as an integer percent of the travel; 0 disables it. */
  readonly overshootPct: number;
  readonly edgeFlavor: EdgeFlavor;
  readonly collapseWeight: CollapseWeight;
}

/**
 * Starting dial values for the G-1 tuning loop; the gate ratifies the final
 * defaults here exactly as 4.0.3.1.2 ratified the layout dials. The mid tier
 * anchors at the contract's fixed ~600 ms.
 */
export const DEFAULT_MOTION_CONFIG: MotionConfig = {
  tempo: { fast: 200, mid: 600, slow: 1000 },
  overshootPct: 12,
  edgeFlavor: 'fade-with-child',
  collapseWeight: 'heavy',
};

/** The spring family in both dialects, sampled from one function. */
export interface SpringFamily {
  /** Normalized easing: `ease(0) = 0`, `ease(1) = 1`, may exceed 1 mid-flight. */
  readonly ease: (t: number) => number;
  /** CSS `linear()` token whose stops are `ease` sampled at even spacing. */
  readonly cssLinear: string;
}

/**
 * Sample count for the CSS `linear()` token. Even spacing lets the token omit
 * per-stop percentages (the spec distributes bare values uniformly), which is
 * also what makes the JS/CSS agreement test exact: stop `i` is `ease(i / N)`.
 */
const CSS_SAMPLE_COUNT = 24;

/** Overshoot solve ceiling; far above the dial range, keeps the solver total. */
const MAX_OVERSHOOT_FRACTION = 0.6;

/**
 * Solves the back-family shape factor whose peak overshoot is `fraction`.
 *
 * For `f(t) = 1 + (s+1)u³ + su²` with `u = t - 1`, the peak sits at
 * `u = -2s / (3(s+1))` and measures `4s³ / (27(s+1)²)` above 1 — monotonic in
 * `s`, so bisection converges deterministically.
 */
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

/**
 * The one spring-like easing family (HC-3), parameterized by overshoot percent.
 *
 * The family is polynomial "back" easing: at 0 % it degenerates to a plain
 * cubic ease-out (the camera's no-overshoot variant), and any positive percent
 * yields a single overshoot past the target that settles without ringing —
 * spring-like, deterministic, and closed-form.
 */
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

/**
 * The mapper-scoped custom properties the stylesheet rules consume, derived
 * from live dial state. Written through CSSOM (`style.setProperty`) on the
 * mapper's own container element — never a JSX `style` attribute — and
 * declared outside the `@theme` block so the component system's transition
 * tokens stay untouched.
 */
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

/**
 * What one adoption or step needs to know from the dials — the scheduler's
 * view of `MotionConfig`, flattened so `tween-model.ts` stays decoupled from
 * the dial shape and tests can drive it with plain numbers.
 */
export interface TweenPlan {
  readonly ease: (t: number) => number;
  readonly moveMs: number;
  readonly birthMs: number;
  readonly exitMs: number;
  readonly heavyExitMs: number;
  readonly collapseHeavy: boolean;
}

/**
 * Flattens live dial state into the scheduler's plan. Under reduced motion,
 * position glides collapse to instant placement (`moveMs` 0); birth and exit
 * windows keep their durations because the stylesheet's reduced-motion gates
 * render them as gentle fades over the same window (DC-6).
 */
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

/** The reduced-motion seam: injectable for tests, browser-backed in the app. */
export type PrefersReducedMotion = () => boolean;

/** Browser-backed reduced-motion read; call only from client-side code. */
export function browserPrefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
