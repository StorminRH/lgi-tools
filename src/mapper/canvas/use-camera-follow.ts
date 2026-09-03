'use client';

import { getViewportForBounds, useReactFlow, useStore } from '@xyflow/react';
import { memo, useEffect, useRef } from 'react';
import type { MapChainIntent } from '../chain/intents';
import type { ChainState } from '../chain/reconciler';
import type { MotionConfig, PrefersReducedMotion } from '../motion/motion-contract';
import {
  CAMERA_FIT_MAX_ZOOM,
  CAMERA_FIT_PADDING,
  IDLE_FLIGHT,
  abortFlightForDrag,
  beginFlight,
  cameraEaseOf,
  decideFocus,
  focusCenter,
  newFocusRequest,
  resolveFitTick,
  settleFlight,
  type CameraBounds,
  type CameraFlight,
} from './camera-follow-model';
import { SYSTEM_FRAME_HEIGHT, SYSTEM_FRAME_WIDTH } from './SystemNode';

const SYSTEM_FRAME_SIZE = {
  width: SYSTEM_FRAME_WIDTH,
  height: SYSTEM_FRAME_HEIGHT,
} as const;

function applyCappedFit(input: {
  readonly bounds: CameraBounds;
  readonly width: number;
  readonly height: number;
  readonly minZoom: number;
  readonly duration: number;
  readonly ease: (t: number) => number;
  readonly setViewport: (
    viewport: { x: number; y: number; zoom: number },
    options: { duration: number; ease: (t: number) => number },
  ) => Promise<boolean>;
  readonly flightRef: { current: CameraFlight };
}): void {
  const flight = beginFlight(input.flightRef.current);
  input.flightRef.current = flight;
  const viewport = getViewportForBounds(
    input.bounds,
    input.width,
    input.height,
    input.minZoom,
    CAMERA_FIT_MAX_ZOOM,
    CAMERA_FIT_PADDING,
  );
  void input.setViewport(viewport, { duration: input.duration, ease: input.ease }).then(() => {
    input.flightRef.current = settleFlight(input.flightRef.current, flight.generation);
  });
}

function isViewportReady(
  viewportInitialized: boolean,
  width: number,
  height: number,
): boolean {
  return viewportInitialized && width > 0 && height > 0;
}

function runCameraFitEffect(input: {
  readonly viewportInitialized: boolean;
  readonly width: number;
  readonly height: number;
  readonly minZoom: number;
  readonly intents: readonly MapChainIntent[];
  readonly follow: boolean;
  readonly dragging: ReadonlySet<number>;
  readonly nodeIds: ReadonlySet<number>;
  readonly systems: ChainState['systems'];
  readonly config: MotionConfig;
  readonly prefersReducedMotion: PrefersReducedMotion;
  readonly setViewport: (
    viewport: { x: number; y: number; zoom: number },
    options: { duration: number; ease: (t: number) => number },
  ) => Promise<boolean>;
  readonly prevIntentsRef: { current: readonly MapChainIntent[] };
  readonly framedRef: { current: boolean };
  readonly flightRef: { current: CameraFlight };
}): void {

  const tick = resolveFitTick({
    viewportReady: isViewportReady(
      input.viewportInitialized,
      input.width,
      input.height,
    ),
    intents: input.intents,
    previousIntents: input.prevIntentsRef.current,
    framed: input.framedRef.current,
    follow: input.follow,
    dragActive: input.dragging.size > 0,
    nodeIds: input.nodeIds,
    systems: input.systems,
    frame: SYSTEM_FRAME_SIZE,
  });
  if (tick.consume) input.prevIntentsRef.current = input.intents;
  input.framedRef.current = tick.framed;
  if (tick.bounds === null) return;
  const { duration, ease } = cameraEaseOf(input.config, input.prefersReducedMotion());
  applyCappedFit({
    bounds: tick.bounds,
    width: input.width,
    height: input.height,
    minZoom: input.minZoom,
    duration,
    ease,
    setViewport: input.setViewport,
    flightRef: input.flightRef,
  });
}

export interface CameraFocusRequest {
  readonly nodeId: string;
  readonly token: number;
}

interface CameraFollowProps {
  readonly intents: readonly MapChainIntent[];
  readonly follow: boolean;
  readonly dragging: ReadonlySet<number>;

  readonly nodeIds: ReadonlySet<number>;

  readonly systems: ChainState['systems'];
  readonly config: MotionConfig;
  readonly prefersReducedMotion: PrefersReducedMotion;

  readonly focusRequest: CameraFocusRequest | null;

  readonly focusEnabled: boolean;
}

function useCameraFollow({
  intents,
  follow,
  dragging,
  nodeIds,
  systems,
  config,
  prefersReducedMotion,
  focusRequest,
  focusEnabled,
}: CameraFollowProps): void {
  const {
    setCenter,
    getViewport,
    setViewport,
    getInternalNode,
    viewportInitialized,
  } = useReactFlow();

  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const minZoom = useStore((state) => state.minZoom);
  const prevIntentsRef = useRef(intents);
  const framedRef = useRef(false);
  const flightRef = useRef(IDLE_FLIGHT);
  const focusTokenRef = useRef(0);

  useEffect(() => {
    runCameraFitEffect({
      viewportInitialized,
      width,
      height,
      minZoom,
      intents,
      follow,
      dragging,
      nodeIds,
      systems,
      config,
      prefersReducedMotion,
      setViewport,
      prevIntentsRef,
      framedRef,
      flightRef,
    });
  }, [
    intents,
    follow,
    dragging,
    nodeIds,
    systems,
    config,
    prefersReducedMotion,
    setViewport,
    viewportInitialized,
    width,
    height,
    minZoom,
  ]);

  const dragActive = dragging.size > 0;
  useEffect(() => {
    if (!dragActive || !flightRef.current.active) return;
    flightRef.current = abortFlightForDrag(flightRef.current);
    void setViewport(getViewport());
  }, [dragActive, setViewport, getViewport]);

  useEffect(() => {
    const request = newFocusRequest(
      focusRequest,
      focusTokenRef.current,
      viewportInitialized,
    );
    if (request === null) return;
    focusTokenRef.current = request.token;
    const action = decideFocus({
      enabled: focusEnabled,
      dragActive: dragging.size > 0,
      center: focusCenter(
        internalNodeSummary(getInternalNode(request.nodeId)),
        SYSTEM_FRAME_SIZE,
      ),
      zoom: getViewport().zoom,
    });
    if (action === null) return;
    const { duration, ease } = cameraEaseOf(config, prefersReducedMotion());
    const flight = beginFlight(flightRef.current);
    flightRef.current = flight;
    void setCenter(action.x, action.y, { zoom: action.zoom, duration, ease }).then(
      () => {
        flightRef.current = settleFlight(flightRef.current, flight.generation);
      },
    );
  }, [
    focusRequest,
    focusEnabled,
    dragging,
    config,
    prefersReducedMotion,
    getInternalNode,
    getViewport,
    setCenter,
    viewportInitialized,
  ]);
}

function internalNodeSummary(
  internal:
    | {
        readonly internals: {
          readonly positionAbsolute: { readonly x: number; readonly y: number };
        };
        readonly measured?: { readonly width?: number; readonly height?: number };
      }
    | undefined,
): {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
} | null {
  if (internal === undefined) return null;
  return {
    x: internal.internals.positionAbsolute.x,
    y: internal.internals.positionAbsolute.y,
    width: internal.measured?.width,
    height: internal.measured?.height,
  };
}

function CameraFollowHostComponent(props: CameraFollowProps) {
  useCameraFollow(props);
  return null;
}

export const CameraFollowHost = memo(CameraFollowHostComponent);
