import type { ChainNode } from '../canvas/SystemNode';
import { SYSTEM_FRAME_HEIGHT, SYSTEM_FRAME_WIDTH } from '../canvas/SystemNode';
import { frameCenter } from '../canvas/edge-geometry';
import type { ChainEdge } from '../chain/nodes';
import { springFamily, type MotionConfig } from '../motion/motion-contract';

const FOG_REVEAL_RADIUS = 280;

const FOG_STROKE_RADIUS = 120;

const FOG_OPACITY = 0.95;

export const FOG_EDGE_CUT_FRACTION = 0.55;

export interface FogConfig {
  readonly revealRadius: number;
  readonly strokeRadius: number;
  readonly opacity: number;
  readonly tier: 'dynamic' | 'static';
}

export const DEFAULT_FOG_CONFIG: FogConfig = {
  revealRadius: FOG_REVEAL_RADIUS,
  strokeRadius: FOG_STROKE_RADIUS,
  opacity: FOG_OPACITY,
  tier: 'dynamic',
};

export type FogPhase = 'steady' | 'entering' | 'departing';

export interface FogDisc {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly phase: FogPhase;
  readonly heavy: boolean;
}

export interface FogStroke {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly phase: FogPhase;
  readonly heavy: boolean;
}

export interface FogRevealSet {
  readonly discs: readonly FogDisc[];
  readonly strokes: readonly FogStroke[];
}

function nodeCenter(node: ChainNode): { readonly x: number; readonly y: number } {
  return frameCenter({
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? SYSTEM_FRAME_WIDTH,
    height: node.height ?? SYSTEM_FRAME_HEIGHT,
  });
}

function nodePhase(node: ChainNode): { readonly phase: FogPhase; readonly heavy: boolean } {
  const motion = node.data.motion;
  if (motion === undefined) return { phase: 'steady', heavy: false };
  return { phase: motion.phase, heavy: motion.heavy === true };
}

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

export interface FogTiming {
  readonly openMs: number;
  readonly closeMs: number;
  readonly heavyCloseMs: number;
  readonly wakeMs: number;
  readonly ease: (t: number) => number;
  readonly reducedMotion: boolean;
}

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

export interface FogTimelineEntry {
  readonly reveal: FogDisc | FogStroke;
  readonly mode: 'opening' | 'open' | 'closing';
  readonly since: number;
  readonly from: number;
  readonly heavy: boolean;
}

export type FogTimeline = ReadonlyMap<string, FogTimelineEntry>;

export const EMPTY_FOG_TIMELINE: FogTimeline = new Map();

export interface FogPaintDisc {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly strength: number;
}

export interface FogPaintStroke {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly strength: number;
}

export interface FogFrame {
  readonly timeline: FogTimeline;
  readonly discs: readonly FogPaintDisc[];
  readonly strokes: readonly FogPaintStroke[];
  readonly animating: boolean;
}

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
    return { reveal, mode: 'opening', since: now, from: current.strength, heavy: false };
  }
  if (previous.mode === 'opening' && !current.running) {
    return { reveal, mode: 'open', since: now, from: 1, heavy: false };
  }
  return { ...previous, reveal };
}

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

export const FOG_WAKE_SPACING = 26;

const FOG_WAKE_MAX_POINTS = 24;

export interface FogWakePoint {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

export interface FogWakeTrail {
  readonly lastX: number;
  readonly lastY: number;
  readonly points: readonly FogWakePoint[];
}

export type FogWakeState = ReadonlyMap<string, FogWakeTrail>;

export const EMPTY_FOG_WAKE: FogWakeState = new Map();

export interface FogWakeFrame {
  readonly state: FogWakeState;
  readonly stamps: readonly FogPaintDisc[];
  readonly animating: boolean;
}

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

export interface FogFrameState {
  readonly timeline: FogTimeline;
  readonly wake: FogWakeState;
}

export const EMPTY_FOG_FRAME_STATE: FogFrameState = {
  timeline: EMPTY_FOG_TIMELINE,
  wake: EMPTY_FOG_WAKE,
};

export interface FogFrameAdvance {
  readonly state: FogFrameState;
  readonly frame: FogFrame;
  readonly wakeStamps: readonly FogPaintDisc[];
  readonly animating: boolean;
  readonly alphaOnly: boolean;
}

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
