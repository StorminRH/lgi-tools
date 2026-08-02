'use client';

// Eased camera fits and click-to-focus, driven by merge intents and the click
// seam. The whole policy — one initial framing regardless of the toggle, then
// follow-gated drag-suppressed refits, slow-tier easing, bounds from
// reconciled targets, focus at preserved zoom, drag-start abort, and
// newer-supersedes-older — lives in `camera-follow-model.ts`, where it is
// unit-tested. Must mount inside `<ReactFlow>`.
//
// Node readiness is required before fitting: ChainHost syncs reconciler
// positions in a parent effect, and child effects run first, so intents can
// arrive a commit before the matching React Flow nodes exist. Waiting on the
// live node-id set (without consuming the intent batch early) keeps the
// one-time framing and follow refits aimed at the laid-out chain.
//
// The installed viewport API's animated calls return promises that NEVER
// settle when a newer call supersedes them, so completion is generation-gated
// through the flight model rather than awaited; the drag-start abort issues a
// zero-duration `setViewport(getViewport())`, which halts the pan at the
// current transform — a stop, not a jump.
import { useReactFlow } from '@xyflow/react';
import { memo, useEffect, useRef } from 'react';
import type { MapChainIntent } from '../chain/intents';
import type { ChainState } from '../chain/reconciler';
import type { MotionConfig, PrefersReducedMotion } from '../motion/motion-contract';
import {
  IDLE_FLIGHT,
  abortFlightForDrag,
  beginFlight,
  cameraEaseOf,
  decideFitExecution,
  decideFocus,
  focusCenter,
  newFocusRequest,
  settleFlight,
} from './camera-follow-model';
import { SYSTEM_DISC_RADIUS } from './SystemNode';

/** One node click the camera may answer; `token` makes each click distinct. */
export interface CameraFocusRequest {
  readonly nodeId: string;
  readonly token: number;
}

/** Everything the camera host consumes. */
export interface CameraFollowProps {
  readonly intents: readonly MapChainIntent[];
  readonly follow: boolean;
  readonly dragging: ReadonlySet<number>;
  /** Rendered node ids — the readiness gate, id-derived so drags don't churn it. */
  readonly nodeIds: ReadonlySet<number>;
  /** Reconciled kernel targets — the bounds source (never rendered positions). */
  readonly systems: ChainState['systems'];
  readonly config: MotionConfig;
  readonly prefersReducedMotion: PrefersReducedMotion;
  /** The click-to-focus seam; `null` until the first click. */
  readonly focusRequest: CameraFocusRequest | null;
  /** The user's click-to-focus setting. */
  readonly focusEnabled: boolean;
}

/** Applies the tested fit, focus, and abort policies to the live viewport. */
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
    fitBounds,
    setCenter,
    getViewport,
    setViewport,
    getInternalNode,
    viewportInitialized,
  } = useReactFlow();
  const prevIntentsRef = useRef(intents);
  const framedRef = useRef(false);
  const flightRef = useRef(IDLE_FLIGHT);
  const focusTokenRef = useRef(0);

  useEffect(() => {
    // Consume nothing until the viewport exists: an intent batch read before
    // panZoom mounts would silently swallow the arrivals the one-time framing
    // keys on. Unreachable in today's mount order, held as an invariant anyway.
    if (!viewportInitialized) return;
    const decision = decideFitExecution({
      intents,
      previousIntents: prevIntentsRef.current,
      framed: framedRef.current,
      follow,
      dragActive: dragging.size > 0,
      nodeIds,
      systems,
      discRadius: SYSTEM_DISC_RADIUS,
    });
    if (decision.consume) prevIntentsRef.current = intents;
    if (decision.bounds === null) return;
    framedRef.current = true;
    const { duration, ease } = cameraEaseOf(config, prefersReducedMotion());
    const flight = beginFlight(flightRef.current);
    flightRef.current = flight;
    void fitBounds(decision.bounds, { padding: 0.15, duration, ease }).then(() => {
      flightRef.current = settleFlight(flightRef.current, flight.generation);
    });
  }, [
    intents,
    follow,
    dragging,
    nodeIds,
    systems,
    config,
    prefersReducedMotion,
    fitBounds,
    viewportInitialized,
  ]);

  // Drag start aborts an in-flight transition: the viewport must not keep
  // panning under a live drag (the follow-off ruling's reason, preserved).
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
        SYSTEM_DISC_RADIUS,
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

/** The position/width triple `focusCenter` needs, from a React Flow internal node. */
function internalNodeSummary(
  internal:
    | {
        readonly internals: {
          readonly positionAbsolute: { readonly x: number; readonly y: number };
        };
        readonly measured: { readonly width?: number };
      }
    | undefined,
): { readonly x: number; readonly y: number; readonly width?: number } | null {
  if (internal === undefined) return null;
  return {
    x: internal.internals.positionAbsolute.x,
    y: internal.internals.positionAbsolute.y,
    width: internal.measured.width,
  };
}

/** Host component so the follow hook can live in the React Flow children slot. */
function CameraFollowHostComponent(props: CameraFollowProps) {
  useCameraFollow(props);
  return null;
}

/**
 * Memoized (drag hardening, IS-5): every prop is identity-stable across a
 * drag's per-frame renders (the id-derived node set above all), so the
 * camera's effects re-run on real policy inputs, not render churn.
 */
export const CameraFollowHost = memo(CameraFollowHostComponent);
