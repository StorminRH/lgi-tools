import type { MapChainIntent } from '../chain/intents';
import type { PlacedSystem } from '../chain/reconciler';
import { springFamily, type MotionConfig } from '../motion/motion-contract';
import { endpointFrame, frameCenter } from './edge-geometry';

export function systemsNeedingFit(
  intents: readonly MapChainIntent[],
): readonly number[] {
  return intents.flatMap((intent) =>
    intent.kind === 'system-appeared' || intent.kind === 'system-moved'
      ? [intent.systemId]
      : [],
  );
}

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

export type CameraFitAction = 'ignore' | 'wait' | 'skip' | 'fit';

export type CameraFitPlan = {
  readonly consume: boolean;
  readonly fit: boolean;
};

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
    ease: springFamily(0).ease,
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

export interface FitExecution {
  readonly consume: boolean;

  readonly bounds: CameraBounds | null;
}

export function decideFitExecution(input: {
  readonly intents: readonly MapChainIntent[];
  readonly previousIntents: readonly MapChainIntent[];
  readonly framed: boolean;
  readonly follow: boolean;
  readonly dragActive: boolean;
  readonly nodeIds: ReadonlySet<number>;
  readonly systems: ReadonlyMap<number, PlacedSystem>;
  readonly frame: NodeFrameSize;
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
    bounds: plan.fit ? chainBounds(input.systems, input.frame) : null,
  };
}

export interface FitTickResult extends FitExecution {
  readonly framed: boolean;
}

export function resolveFitTick(input: {
  readonly viewportReady: boolean;
  readonly intents: readonly MapChainIntent[];
  readonly previousIntents: readonly MapChainIntent[];
  readonly framed: boolean;
  readonly follow: boolean;
  readonly dragActive: boolean;
  readonly nodeIds: ReadonlySet<number>;
  readonly systems: ReadonlyMap<number, PlacedSystem>;
  readonly frame: NodeFrameSize;
}): FitTickResult {
  if (!input.viewportReady) {
    return { consume: false, bounds: null, framed: input.framed };
  }
  const decision = decideFitExecution(input);
  return {
    ...decision,
    framed: decision.bounds !== null ? true : input.framed,
  };
}

export interface FocusAction {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export function decideFocus(input: {
  readonly enabled: boolean;
  readonly dragActive: boolean;
  readonly center: { readonly x: number; readonly y: number } | null;
  readonly zoom: number;
}): FocusAction | null {
  if (!input.enabled || input.dragActive || input.center === null) return null;
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

export function focusCenter(
  node: {
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly height?: number;
  } | null,
  frame: NodeFrameSize,
): { readonly x: number; readonly y: number } | null {
  if (node === null) return null;
  const box = endpointFrame({
    internals: { positionAbsolute: { x: node.x, y: node.y } },
    measured: { width: node.width, height: node.height },
    width: frame.width,
    height: frame.height,
  });
  return box === null ? null : frameCenter(box);
}

export interface CameraFlight {
  readonly generation: number;
  readonly active: boolean;
}

export const IDLE_FLIGHT: CameraFlight = { generation: 0, active: false };

export function beginFlight(flight: CameraFlight): CameraFlight {
  return { generation: flight.generation + 1, active: true };
}

export function settleFlight(
  flight: CameraFlight,
  generation: number,
): CameraFlight {
  if (generation !== flight.generation || !flight.active) return flight;
  return { generation: flight.generation, active: false };
}

export function abortFlightForDrag(flight: CameraFlight): CameraFlight {
  if (!flight.active) return flight;
  return { generation: flight.generation + 1, active: false };
}
