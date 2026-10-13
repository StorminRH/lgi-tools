import type { MapChainIntent } from '../chain/intents';
import type { PlacedSystem } from '../chain/reconciler';
import { SETTLE_SPRING, type MotionConfig } from '../motion/motion-contract';

export interface CameraEase {
  readonly duration: number;
  readonly ease: (t: number) => number;
}

export function cameraEaseOf(
  config: MotionConfig,
  reducedMotion: boolean,
): CameraEase {
  return {
    duration: reducedMotion ? 0 : config.tempo.slow,
    ease: SETTLE_SPRING.ease,
  };
}

export interface CameraBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const CAMERA_FIT_MAX_ZOOM = 0.75;

export const CAMERA_FIT_PADDING = 0.15;

export interface NodeFrameSize {
  readonly width: number;
  readonly height: number;
}

export function chainBounds(
  systems: ReadonlyMap<number, PlacedSystem>,
  frame: NodeFrameSize,
): CameraBounds | null {
  if (systems.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const placed of systems.values()) {
    minX = Math.min(minX, placed.position.x);
    minY = Math.min(minY, placed.position.y);
    maxX = Math.max(maxX, placed.position.x);
    maxY = Math.max(maxY, placed.position.y);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX + frame.width,
    height: maxY - minY + frame.height,
  };
}

type FitTarget = Extract<
  MapChainIntent,
  { readonly kind: 'system-appeared' | 'system-moved' }
>;

function movedOrAppeared(intent: MapChainIntent): intent is FitTarget {
  return intent.kind === 'system-appeared' || intent.kind === 'system-moved';
}

export interface FitInput {
  readonly viewportReady: boolean;
  readonly intents: readonly MapChainIntent[];
  readonly previousIntents: readonly MapChainIntent[];
  readonly framed: boolean;
  readonly follow: boolean;
  readonly nodeIds: ReadonlySet<number>;
  readonly systems: ReadonlyMap<number, PlacedSystem>;
  readonly frame: NodeFrameSize;
}

export interface FitTickResult {
  readonly consume: boolean;
  readonly bounds: CameraBounds | null;
  readonly framed: boolean;
}

/**
 * One camera-fit decision per effect run. A tick that does not consume leaves
 * the intents to be read again: the viewport is not ready, the intents are the
 * ones already handled, or a system to frame has no mounted node yet. A tick
 * with nothing that appeared or moved, or that is already framed while follow
 * is off, consumes without fitting.
 */
export function resolveFitTick(input: FitInput): FitTickResult {
  const { framed } = input;
  if (!input.viewportReady || input.intents === input.previousIntents) {
    return { consume: false, bounds: null, framed };
  }
  const targets = input.intents.filter(movedOrAppeared);
  if (targets.length === 0 || (framed && !input.follow)) {
    return { consume: true, bounds: null, framed };
  }
  if (targets.some((intent) => !input.nodeIds.has(intent.systemId))) {
    return { consume: false, bounds: null, framed };
  }
  const bounds = chainBounds(input.systems, input.frame);
  return { consume: true, bounds, framed: bounds !== null || framed };
}

export interface FocusAction {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export function decideFocus(input: {
  readonly enabled: boolean;
  readonly center: { readonly x: number; readonly y: number } | null;
  readonly zoom: number;
}): FocusAction | null {
  if (!input.enabled || input.center === null) return null;
  return { x: input.center.x, y: input.center.y, zoom: input.zoom };
}

export function newFocusRequest<Request extends { readonly token: number }>(
  request: Request | null,
  lastToken: number,
  viewportInitialized: boolean,
): Request | null {
  if (!viewportInitialized || request === null || request.token === lastToken) {
    return null;
  }
  return request;
}
