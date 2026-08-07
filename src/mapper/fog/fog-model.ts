// The pure half of the fog-of-war layer (4.0.4.2.3 OW4): reveal membership,
// the open/close timeline, the drag wake, and the cover/backing math the
// canvas host executes verbatim.
//
// Everything here derives from the motion layer's presentation output — the
// same arrays `ChainSurface` renders — so fog can never disagree with the
// drawn canvas: a node the canvas shows gets a reveal, a ghost keeps its
// reveal for exactly its exit window, and a fogged ring-3 node contributes
// nothing (its cloud cover IS the absence of a reveal). Nothing here reads
// Convex or writes anywhere (HC-1); identical presentation yields identical
// fog on every client (DC-2).
import type { ChainNode } from '../canvas/SystemNode';
import { SYSTEM_FRAME_HEIGHT, SYSTEM_FRAME_WIDTH } from '../canvas/SystemNode';
import { frameCenter } from '../canvas/edge-geometry';
import type { ChainEdge } from '../chain/nodes';
import { springFamily, type MotionConfig } from '../motion/motion-contract';

/**
 * Reveal radius around one drawn node's frame center, in world units. Pinned
 * constant tuned at the G-1 gate; no runtime configuration surface (operator
 * direction, plan PD-2 — the dev dial panel tunes it during the gate only).
 */
export const FOG_REVEAL_RADIUS = 280;

/** Corridor half-width of the reveal stroke along a fully-drawn edge. */
export const FOG_STROKE_RADIUS = 120;

/** Cloud density over the covered canvas; see `FOG_REVEAL_RADIUS`. */
export const FOG_OPACITY = 0.95;

/**
 * Where a fogged-endpoint line cuts off, as a fraction of the drawn-to-fogged
 * segment: the visible stub runs into the cloud and ends well short of the
 * invisible endpoint, so the line reads as entering the fog.
 */
export const FOG_EDGE_CUT_FRACTION = 0.55;

/** Live fog dial state for the G-1 tuning gate; production ships the pins. */
export interface FogConfig {
  readonly revealRadius: number;
  readonly strokeRadius: number;
  /** Cloud density in [0, 1]. */
  readonly opacity: number;
  /**
   * `dynamic` plays the smoke open/close/wake timeline; `static` is the
   * pinned degradation tier — reveals snap, edges stay smoky, zero animation.
   */
  readonly tier: 'dynamic' | 'static';
}

/** The pinned defaults the dial panel starts from. */
export const DEFAULT_FOG_CONFIG: FogConfig = {
  revealRadius: FOG_REVEAL_RADIUS,
  strokeRadius: FOG_STROKE_RADIUS,
  opacity: FOG_OPACITY,
  tier: 'dynamic',
};

/** One reveal's motion standing, mirrored from the presentation vocabulary. */
export type FogPhase = 'steady' | 'entering' | 'departing';

/** A disc reveal hugging one drawn node. */
export interface FogDisc {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly phase: FogPhase;
  readonly heavy: boolean;
}

/** A corridor reveal along one fully-drawn edge, frame center to center. */
export interface FogStroke {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly phase: FogPhase;
  readonly heavy: boolean;
}

/** The reveal membership one presentation commit demands. */
export interface FogRevealSet {
  readonly discs: readonly FogDisc[];
  readonly strokes: readonly FogStroke[];
}

/** A node's disc center through the shared frame policy owner. */
function nodeCenter(node: ChainNode): { readonly x: number; readonly y: number } {
  return frameCenter({
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? SYSTEM_FRAME_WIDTH,
    height: node.height ?? SYSTEM_FRAME_HEIGHT,
  });
}

/** A node's fog phase from its motion presentation. */
function nodePhase(node: ChainNode): { readonly phase: FogPhase; readonly heavy: boolean } {
  const motion = node.data.motion;
  if (motion === undefined) return { phase: 'steady', heavy: false };
  return { phase: motion.phase, heavy: motion.heavy === true };
}

/**
 * Reveal membership from one presentation commit: a disc for every non-fogged
 * rendered node (ghosts included, so a despawn's reveal closes on the ghost
 * timeline), and a corridor stroke only for an edge both of whose endpoints
 * carry discs — a fogged-endpoint line gets no stroke, so it visibly runs
 * into the cloud (SC-3.2).
 */
export function deriveFogReveals(
  nodes: readonly ChainNode[],
  edges: readonly ChainEdge[],
): FogRevealSet {
  const discs: FogDisc[] = [];
  const discById = new Map<string, FogDisc>();
  for (const node of nodes) {
    if (node.data.halo?.fogged === true) continue;
    const center = nodeCenter(node);
    const { phase, heavy } = nodePhase(node);
    const disc: FogDisc = { key: `d:${node.id}`, x: center.x, y: center.y, phase, heavy };
    discs.push(disc);
    discById.set(node.id, disc);
  }

  const strokes: FogStroke[] = [];
  for (const edge of edges) {
    const source = discById.get(edge.source);
    const target = discById.get(edge.target);
    if (source === undefined || target === undefined) continue;
    const motion = edge.data.motion;
    strokes.push({
      key: `s:${edge.id}`,
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      phase: motion === undefined ? 'steady' : motion.phase,
      heavy: motion !== undefined && motion.phase === 'departing' && motion.heavy,
    });
  }
  return { discs, strokes };
}

/** The clock/easing plan one timeline advance consumes. */
export interface FogTiming {
  /** Reveal open window — the motion mid tier, so fog opens with births. */
  readonly openMs: number;
  /** Reveal close window — the mid tier again, matching ordinary exits. */
  readonly closeMs: number;
  /** Heavy-collapse close window — the slow tier, matching heavy ghosts. */
  readonly heavyCloseMs: number;
  /** Drag-wake stamp lifetime. */
  readonly wakeMs: number;
  readonly ease: (t: number) => number;
  readonly reducedMotion: boolean;
}

/**
 * Fog timing from live dial state: reveals ride the same tempo tiers the
 * motion layer plays, with the settle (no-overshoot) ease — an overshooting
 * reveal radius would wobble the cloud. Reduced motion keeps the windows but
 * flattens to linear opacity easing with no smoke dynamics (DC-6's shape).
 */
export function fogTimingOf(config: MotionConfig, reducedMotion: boolean): FogTiming {
  return {
    openMs: config.tempo.mid,
    closeMs: config.tempo.mid,
    heavyCloseMs: config.tempo.slow,
    wakeMs: config.tempo.fast * 2,
    ease: reducedMotion ? (t: number) => t : springFamily(0).ease,
    reducedMotion,
  };
}

/** One tracked reveal's animation standing. */
export interface FogTimelineEntry {
  /** The last observed geometry, kept so a vanished reveal can close in place. */
  readonly reveal: FogDisc | FogStroke;
  readonly mode: 'opening' | 'open' | 'closing';
  /** When `mode` began. */
  readonly since: number;
  /** Strength when `mode` began. */
  readonly from: number;
  readonly heavy: boolean;
}

/** The whole timeline between two advances. */
export type FogTimeline = ReadonlyMap<string, FogTimelineEntry>;

/** The empty timeline — the state before the first advance. */
export const EMPTY_FOG_TIMELINE: FogTimeline = new Map();

/** One paintable disc stamp. */
export interface FogPaintDisc {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  /** Reveal strength in (0, 1]: radius and alpha scale for the painter. */
  readonly strength: number;
}

/** One paintable corridor stamp. */
export interface FogPaintStroke {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly strength: number;
}

/** One advanced frame: the next timeline plus what the painter stamps. */
export interface FogFrame {
  readonly timeline: FogTimeline;
  readonly discs: readonly FogPaintDisc[];
  readonly strokes: readonly FogPaintStroke[];
  /** True while any reveal is mid-open or mid-close — keep the frame loop. */
  readonly animating: boolean;
}

/** An entry's strength at `now`, and whether its window is still running. */
function entryStrength(
  entry: FogTimelineEntry,
  now: number,
  timing: FogTiming,
): { readonly strength: number; readonly running: boolean } {
  if (entry.mode === 'open') return { strength: 1, running: false };
  const window =
    entry.mode === 'closing'
      ? entry.heavy
        ? timing.heavyCloseMs
        : timing.closeMs
      : timing.openMs;
  const t = window <= 0 ? 1 : Math.min(1, (now - entry.since) / window);
  const eased = timing.ease(t);
  const strength =
    entry.mode === 'opening'
      ? entry.from + (1 - entry.from) * eased
      : entry.from * (1 - eased);
  return { strength, running: t < 1 };
}

/** The entry one observed reveal becomes, given its previous standing. */
function nextEntry(
  previous: FogTimelineEntry | undefined,
  reveal: FogDisc | FogStroke,
  initial: boolean,
  now: number,
  timing: FogTiming,
): FogTimelineEntry {
  if (previous === undefined) {
    if (reveal.phase === 'departing') {
      return { reveal, mode: 'closing', since: now, from: 1, heavy: reveal.heavy };
    }
    // The first observed batch snaps its steady reveals open — a mounted map
    // is not a birth; an actual birth (entering) animates even then.
    if (initial && reveal.phase === 'steady') {
      return { reveal, mode: 'open', since: now, from: 1, heavy: false };
    }
    return { reveal, mode: 'opening', since: now, from: 0, heavy: false };
  }
  const current = entryStrength(previous, now, timing);
  if (reveal.phase === 'departing') {
    if (previous.mode === 'closing') return { ...previous, reveal, heavy: reveal.heavy };
    return { reveal, mode: 'closing', since: now, from: current.strength, heavy: reveal.heavy };
  }
  if (previous.mode === 'closing') {
    // Reopening (a departure superseded mid-close): ramp back up from here.
    return { reveal, mode: 'opening', since: now, from: current.strength, heavy: false };
  }
  if (previous.mode === 'opening' && !current.running) {
    return { reveal, mode: 'open', since: now, from: 1, heavy: false };
  }
  return { ...previous, reveal };
}

/** Appends one entry's stamp (nothing when fully closed). */
function appendStamp(
  entry: FogTimelineEntry,
  strength: number,
  discs: FogPaintDisc[],
  strokes: FogPaintStroke[],
): void {
  if (strength <= 0) return;
  const reveal = entry.reveal;
  if ('x' in reveal) {
    discs.push({ key: reveal.key, x: reveal.x, y: reveal.y, strength });
  } else {
    strokes.push({
      key: reveal.key,
      x1: reveal.x1,
      y1: reveal.y1,
      x2: reveal.x2,
      y2: reveal.y2,
      strength,
    });
  }
}

/**
 * Advances the fog timeline one frame: observed reveals open (or close, for
 * departing ghosts) on the motion windows, vanished reveals close in place
 * from their last geometry, and fully-closed entries drop. The returned
 * `animating` flag is the host's whole scheduling contract — false means the
 * fog is settled and no further frame may be scheduled (the idle map stays
 * still).
 */
export function advanceFogTimeline(
  previous: FogTimeline,
  reveals: FogRevealSet,
  now: number,
  timing: FogTiming,
): FogFrame {
  const initial = previous.size === 0;
  const timeline = new Map<string, FogTimelineEntry>();
  const discs: FogPaintDisc[] = [];
  const strokes: FogPaintStroke[] = [];
  let animating = false;

  const observe = (reveal: FogDisc | FogStroke): void => {
    const entry = nextEntry(previous.get(reveal.key), reveal, initial, now, timing);
    const { strength, running } = entryStrength(entry, now, timing);
    timeline.set(reveal.key, entry);
    if (running) animating = true;
    appendStamp(entry, strength, discs, strokes);
  };
  for (const disc of reveals.discs) observe(disc);
  for (const stroke of reveals.strokes) observe(stroke);

  for (const [key, entry] of previous) {
    if (timeline.has(key)) continue;
    const vanished =
      entry.mode === 'closing'
        ? entry
        : {
            ...entry,
            mode: 'closing' as const,
            since: now,
            from: entryStrength(entry, now, timing).strength,
          };
    const { strength, running } = entryStrength(vanished, now, timing);
    if (!running || strength <= 0) continue;
    timeline.set(key, vanished);
    animating = true;
    appendStamp(vanished, strength, discs, strokes);
  }

  return { timeline, discs, strokes, animating };
}

/**
 * The static degradation tier: every observed reveal stamps at full strength
 * instantly, departures simply vanish, and nothing ever animates. This is the
 * pinned budget/G-1 fallback, not an error path.
 */
export function snapFogFrame(reveals: FogRevealSet, now: number): FogFrame {
  const timeline = new Map<string, FogTimelineEntry>();
  const discs: FogPaintDisc[] = [];
  const strokes: FogPaintStroke[] = [];
  const observe = (reveal: FogDisc | FogStroke): void => {
    if (reveal.phase === 'departing') return;
    const entry: FogTimelineEntry = { reveal, mode: 'open', since: now, from: 1, heavy: false };
    timeline.set(reveal.key, entry);
    appendStamp(entry, 1, discs, strokes);
  };
  for (const disc of reveals.discs) observe(disc);
  for (const stroke of reveals.strokes) observe(stroke);
  return { timeline, discs, strokes, animating: false };
}

/** World distance between wake stamps dropped along a moving disc's path. */
export const FOG_WAKE_SPACING = 26;

/** Most wake points one disc may hold — bounds a fast, long drag. */
const FOG_WAKE_MAX_POINTS = 24;

/** One fading stamp a moving reveal left behind. */
export interface FogWakePoint {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

/** Per-disc wake bookkeeping between advances. */
export interface FogWakeTrail {
  readonly lastX: number;
  readonly lastY: number;
  readonly points: readonly FogWakePoint[];
}

/** The whole wake state. */
export type FogWakeState = ReadonlyMap<string, FogWakeTrail>;

/** The empty wake — also what the static tier and reduced motion feed back. */
export const EMPTY_FOG_WAKE: FogWakeState = new Map();

/** One advanced wake frame. */
export interface FogWakeFrame {
  readonly state: FogWakeState;
  /** Fading stamps, painter-ready (strength decays over the wake window). */
  readonly stamps: readonly FogPaintDisc[];
  readonly animating: boolean;
}

/** Wake points sampled along one movement delta at the stamp spacing. */
function wakeSamples(trail: FogWakeTrail, x: number, y: number, now: number): FogWakePoint[] {
  const dx = x - trail.lastX;
  const dy = y - trail.lastY;
  const distance = Math.hypot(dx, dy);
  const count = Math.floor(distance / FOG_WAKE_SPACING);
  const samples: FogWakePoint[] = [];
  for (let step = 1; step <= count; step += 1) {
    const t = (step * FOG_WAKE_SPACING) / distance;
    samples.push({ x: trail.lastX + dx * t, y: trail.lastY + dy * t, at: now });
  }
  return samples;
}

/**
 * Advances the drag wake: a disc that moved since the last frame drops fading
 * stamps along its path (fog closes behind it as they expire — the smoke
 * wake), stationary discs shed expired points, and discs no longer present
 * fade out their remaining trail. The host skips this entirely under reduced
 * motion and on the static tier.
 */
export function advanceFogWake(
  previous: FogWakeState,
  discs: readonly FogPaintDisc[],
  now: number,
  wakeMs: number,
): FogWakeFrame {
  const state = new Map<string, FogWakeTrail>();
  const stamps: FogPaintDisc[] = [];

  const stamp = (key: string, points: readonly FogWakePoint[]): void => {
    for (const point of points) {
      const strength = 1 - (now - point.at) / wakeMs;
      stamps.push({ key: `w:${key}`, x: point.x, y: point.y, strength });
    }
  };
  const prune = (points: readonly FogWakePoint[]): FogWakePoint[] =>
    points.filter((point) => now - point.at < wakeMs).slice(-FOG_WAKE_MAX_POINTS);

  for (const disc of discs) {
    const trail = previous.get(disc.key);
    const grown =
      trail === undefined
        ? []
        : prune([...trail.points, ...wakeSamples(trail, disc.x, disc.y, now)]);
    state.set(disc.key, { lastX: disc.x, lastY: disc.y, points: grown });
    stamp(disc.key, grown);
  }
  // A disc no longer present fades out whatever trail it left behind.
  for (const [key, trail] of previous) {
    if (state.has(key)) continue;
    const remaining = prune(trail.points);
    if (remaining.length === 0) continue;
    state.set(key, { ...trail, points: remaining });
    stamp(key, remaining);
  }

  const animating = [...state.values()].some((trail) => trail.points.length > 0);
  return { state, stamps, animating };
}

/** The timeline+wake pair one frame advances together. */
export interface FogFrameState {
  readonly timeline: FogTimeline;
  readonly wake: FogWakeState;
}

/** The state before the first frame. */
export const EMPTY_FOG_FRAME_STATE: FogFrameState = {
  timeline: EMPTY_FOG_TIMELINE,
  wake: EMPTY_FOG_WAKE,
};

/** One whole frame advance: next state plus everything the painter consumes. */
export interface FogFrameAdvance {
  readonly state: FogFrameState;
  readonly frame: FogFrame;
  readonly wakeStamps: readonly FogPaintDisc[];
  /** True while anything is mid-animation — the host's scheduling contract. */
  readonly animating: boolean;
  /** Reduced motion: the painter animates alpha only, never smoke radius. */
  readonly alphaOnly: boolean;
}

/**
 * Advances one fog frame under the configured tier: the static degradation
 * tier snaps and never animates; the dynamic tier runs the open/close
 * timeline and (outside reduced motion) the drag wake.
 */
export function advanceFogFrame(
  previous: FogFrameState,
  reveals: FogRevealSet,
  config: FogConfig,
  motion: MotionConfig,
  reducedMotion: boolean,
  now: number,
): FogFrameAdvance {
  const timing = fogTimingOf(motion, reducedMotion);
  const frame =
    config.tier === 'static'
      ? snapFogFrame(reveals, now)
      : advanceFogTimeline(previous.timeline, reveals, now, timing);
  const wake =
    config.tier === 'dynamic' && !reducedMotion
      ? advanceFogWake(previous.wake, frame.discs, now, timing.wakeMs)
      : { state: EMPTY_FOG_WAKE, stamps: [], animating: false };
  return {
    state: { timeline: frame.timeline, wake: wake.state },
    frame,
    wakeStamps: wake.stamps,
    animating: frame.animating || wake.animating,
    alphaOnly: reducedMotion,
  };
}
