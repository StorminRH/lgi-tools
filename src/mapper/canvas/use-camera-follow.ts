'use client';

import {
  getViewportForBounds,
  useReactFlow,
  useStore,
  type SetViewport,
} from '@xyflow/react';
import { memo, useEffect, useRef } from 'react';
import type { MapChainIntent } from '../chain/intents';
import type { ChainState } from '../chain/reconciler';
import type { MotionConfig, PrefersReducedMotion } from '../motion/motion-contract';
import {
  CAMERA_FIT_MAX_ZOOM,
  CAMERA_FIT_PADDING,
  cameraEaseOf,
  decideFocus,
  newFocusRequest,
  resolveFitTick,
} from './camera-follow-model';
import { SYSTEM_FRAME_SIZE } from './disc-chrome';
import { nodeCenter } from './edge-geometry';

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
  readonly nodeIds: ReadonlySet<number>;
  readonly systems: ChainState['systems'];
  readonly config: MotionConfig;
  readonly prefersReducedMotion: PrefersReducedMotion;
  readonly setViewport: SetViewport;
  readonly prevIntentsRef: { current: readonly MapChainIntent[] };
  readonly framedRef: { current: boolean };
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
    nodeIds: input.nodeIds,
    systems: input.systems,
    frame: SYSTEM_FRAME_SIZE,
  });
  if (tick.consume) input.prevIntentsRef.current = input.intents;
  input.framedRef.current = tick.framed;
  if (tick.bounds === null) return;
  const { duration, ease } = cameraEaseOf(input.config, input.prefersReducedMotion());
  const viewport = getViewportForBounds(
    tick.bounds,
    input.width,
    input.height,
    input.minZoom,
    CAMERA_FIT_MAX_ZOOM,
    CAMERA_FIT_PADDING,
  );
  void input.setViewport(viewport, { duration, ease });
}

export interface CameraFocusRequest {
  readonly nodeId: string;
  readonly token: number;
}

interface CameraFollowProps {
  readonly intents: readonly MapChainIntent[];
  readonly follow: boolean;
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
  const focusTokenRef = useRef(0);

  useEffect(() => {
    runCameraFitEffect({
      viewportInitialized,
      width,
      height,
      minZoom,
      intents,
      follow,
      nodeIds,
      systems,
      config,
      prefersReducedMotion,
      setViewport,
      prevIntentsRef,
      framedRef,
    });
  }, [
    intents,
    follow,
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
      center: nodeCenter(getInternalNode(request.nodeId)),
      zoom: getViewport().zoom,
    });
    if (action === null) return;
    const { duration, ease } = cameraEaseOf(config, prefersReducedMotion());
    void setCenter(action.x, action.y, { zoom: action.zoom, duration, ease });
  }, [
    focusRequest,
    focusEnabled,
    config,
    prefersReducedMotion,
    getInternalNode,
    getViewport,
    setCenter,
    viewportInitialized,
  ]);
}

function CameraFollowHostComponent(props: CameraFollowProps) {
  useCameraFollow(props);
  return null;
}

export const CameraFollowHost = memo(CameraFollowHostComponent);
