// Pure camera-follow policy, kept apart from the hook so the framing rules are
// unit-tested rather than browser-observed.
//
// 4.0.3.2 adds the easing half: every fit and focus carries the slow tier's
// duration and the family's no-overshoot ease, bounds are computed from
// reconciled kernel targets (never rendered arrays, which may be mid-glide),
// a drag start aborts an in-flight transition, and a newer fit or focus
// supersedes an older one. The installed viewport API never settles a
// superseded transition's promise, so supersession is generation-tracked here
// rather than awaited.
import type { MapChainIntent } from '../chain/intents';
import type { PlacedSystem } from '../chain/reconciler';
import { springFamily, type MotionConfig } from '../motion/motion-contract';

/** System ids an intent batch would ask the camera to frame. */
export function systemsNeedingFit(
  intents: readonly MapChainIntent[],
): readonly number[] {
  return intents.flatMap((intent) =>
    intent.kind === 'system-appeared' || intent.kind === 'system-moved'
      ? [intent.systemId]
      : [],
  );
}

/**
 * Whether React Flow already holds every node a fit would target.
 *
 * ChainHost commits reconciler positions in a passive effect, so the camera
 * hook must wait for those nodes before calling `fitView` — otherwise the
 * first framing (and follow refits) target the previous empty/stale set, and
 * the intent-identity guard never retries.
 */
export function nodesReadyForFit(
  intents: readonly MapChainIntent[],
  nodeIds: ReadonlySet<number>,
): boolean {
  return systemsNeedingFit(intents).every((systemId) => nodeIds.has(systemId));
}

/**
 * Whether a merge's intents warrant a viewport fit. The first fit is initial
 * presentation and ignores the follow toggle — without it a fresh map load
 * leaves the layout origin in the top-left corner under the chrome. Every
 * later fit is following: it requires the toggle on and no active drag
 * (operator G-1 call: the camera must not move on its own).
 */
export function shouldFitView(input: {
  readonly intents: readonly MapChainIntent[];
  readonly framed: boolean;
  readonly follow: boolean;
  readonly dragActive: boolean;
}): boolean {
  const appeared = input.intents.some(
    (intent) => intent.kind === 'system-appeared' || intent.kind === 'system-moved',
  );
  if (!appeared) return false;
  if (!input.framed) return true;
  return input.follow && !input.dragActive;
}

/** Hook action for one intent/node observation. */
export type CameraFitAction = 'ignore' | 'wait' | 'skip' | 'fit';

/** Whether the hook should consume the intent batch and/or call `fitView`. */
export type CameraFitPlan = {
  readonly consume: boolean;
  readonly fit: boolean;
};

/**
 * Pure camera-fit decision for one effect tick.
 *
 * - `ignore`: same intent batch already consumed
 * - `wait`: fit is warranted but React Flow nodes are not ready yet
 * - `skip`: consume the batch without fitting
 * - `fit`: consume the batch and call `fitView`
 */
export function decideCameraFit(input: {
  readonly intents: readonly MapChainIntent[];
  readonly previousIntents: readonly MapChainIntent[];
  readonly framed: boolean;
  readonly follow: boolean;
  readonly dragActive: boolean;
  readonly nodeIds: ReadonlySet<number>;
}): CameraFitAction {
  if (input.intents === input.previousIntents) return 'ignore';
  if (
    !shouldFitView({
      intents: input.intents,
      framed: input.framed,
      follow: input.follow,
      dragActive: input.dragActive,
    })
  ) {
    return 'skip';
  }
  if (!nodesReadyForFit(input.intents, input.nodeIds)) return 'wait';
  return 'fit';
}

/** Maps a fit action onto the two ref updates the hook performs. */
export function planCameraFit(action: CameraFitAction): CameraFitPlan {
  switch (action) {
    case 'ignore':
    case 'wait':
      return { consume: false, fit: false };
    case 'skip':
      return { consume: true, fit: false };
    case 'fit':
      return { consume: true, fit: true };
  }
}

/** The duration/ease pair every camera move carries. */
export interface CameraEase {
  readonly duration: number;
  readonly ease: (t: number) => number;
}

/**
 * The camera's easing: slow tier, no-overshoot spring variant (an
 * overshooting pan reads as a lunge). Reduced motion is the one zero-duration
 * path (DC-6).
 */
export function cameraEaseOf(
  config: MotionConfig,
  reducedMotion: boolean,
): CameraEase {
  return {
    duration: reducedMotion ? 0 : config.tempo.slow,
    ease: springFamily(0).ease,
  };
}

/** The rect shape the viewport's `fitBounds` accepts. */
export interface CameraBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Height allowance for the name label beneath a disc; bounds framing is a
 * padding decision, not measurement, so an estimate is correct here.
 */
const NODE_LABEL_ALLOWANCE = 24;

/**
 * Fit bounds from reconciled kernel targets — deliberately NOT from rendered
 * node positions, so a fit issued during a mass glide frames the settled
 * chain rather than a mid-tween scatter. Positions are node top-left corners;
 * the disc diameter and label allowance pad the far edges.
 */
export function chainBounds(
  systems: ReadonlyMap<number, PlacedSystem>,
  discRadius: number,
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
    width: maxX - minX + discRadius * 2,
    height: maxY - minY + discRadius * 2 + NODE_LABEL_ALLOWANCE,
  };
}

/** One fit tick's whole decision: what to consume and where to fit. */
export interface FitExecution {
  readonly consume: boolean;
  /** `null` means no fit this tick (not warranted, not ready, or empty chain). */
  readonly bounds: CameraBounds | null;
}

/**
 * The complete per-tick fit decision the hook executes verbatim: the
 * consume/fit policy composed with bounds from reconciled targets.
 */
export function decideFitExecution(input: {
  readonly intents: readonly MapChainIntent[];
  readonly previousIntents: readonly MapChainIntent[];
  readonly framed: boolean;
  readonly follow: boolean;
  readonly dragActive: boolean;
  readonly nodeIds: ReadonlySet<number>;
  readonly systems: ReadonlyMap<number, PlacedSystem>;
  readonly discRadius: number;
}): FitExecution {
  const plan = planCameraFit(
    decideCameraFit({
      intents: input.intents,
      previousIntents: input.previousIntents,
      framed: input.framed,
      follow: input.follow,
      dragActive: input.dragActive,
      nodeIds: input.nodeIds,
    }),
  );
  return {
    consume: plan.consume,
    bounds: plan.fit ? chainBounds(input.systems, input.discRadius) : null,
  };
}

/** A click-to-focus action: center here, at exactly this zoom. */
export interface FocusAction {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * The click-to-focus decision: only when the setting is on, no drag is live,
 * and the clicked node resolved to a center point. The current viewport zoom
 * is carried explicitly because the installed `setCenter` otherwise lunges to
 * `maxZoom`. Focus is additive to selection — deciding it never consumes or
 * alters the click's selection behavior.
 */
export function decideFocus(input: {
  readonly enabled: boolean;
  readonly dragActive: boolean;
  readonly center: { readonly x: number; readonly y: number } | null;
  readonly zoom: number;
}): FocusAction | null {
  if (!input.enabled || input.dragActive || input.center === null) return null;
  return { x: input.center.x, y: input.center.y, zoom: input.zoom };
}

/** A focus request the camera has not answered yet, or `null`. */
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

/**
 * The clicked node's disc center: the disc sits centered at the top of the
 * node column. `null` when the node no longer exists.
 */
export function focusCenter(
  node: { readonly x: number; readonly y: number; readonly width?: number } | null,
  discRadius: number,
): { readonly x: number; readonly y: number } | null {
  if (node === null) return null;
  return {
    x: node.x + (node.width ?? discRadius * 2) / 2,
    y: node.y + discRadius,
  };
}

/**
 * Generation-tracked camera transition state. The installed viewport promises
 * never settle when superseded, so completion is only honored for the
 * generation that started it; a newer flight or an abort bumps the
 * generation, orphaning the older completion.
 */
export interface CameraFlight {
  readonly generation: number;
  readonly active: boolean;
}

/** No transition in flight. */
export const IDLE_FLIGHT: CameraFlight = { generation: 0, active: false };

/** A new fit or focus takes over: newer supersedes older (the generation bump). */
export function beginFlight(flight: CameraFlight): CameraFlight {
  return { generation: flight.generation + 1, active: true };
}

/** A transition's own completion; a superseded generation changes nothing. */
export function settleFlight(
  flight: CameraFlight,
  generation: number,
): CameraFlight {
  if (generation !== flight.generation || !flight.active) return flight;
  return { generation: flight.generation, active: false };
}

/**
 * Drag start: an in-flight transition is aborted — the viewport must not keep
 * panning under a live drag. Idle flights are untouched, so drags without a
 * camera move cost nothing.
 */
export function abortFlightForDrag(flight: CameraFlight): CameraFlight {
  if (!flight.active) return flight;
  return { generation: flight.generation + 1, active: false };
}
