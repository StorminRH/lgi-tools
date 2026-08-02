'use client';

// Zero-duration camera fits driven by merge intents. The fit policy — one
// initial framing regardless of the toggle, then follow-gated, drag-suppressed
// refits — lives in `camera-follow-model.ts`, where it is unit-tested. Must
// mount inside `<ReactFlow>`.
import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import type { MapChainIntent } from '../chain/intents';
import { shouldFitView } from './camera-follow-model';

/** Applies the tested fit policy to the live viewport. */
function useCameraFollow(
  intents: readonly MapChainIntent[],
  follow: boolean,
  dragging: ReadonlySet<number>,
): void {
  const { fitView, viewportInitialized } = useReactFlow();
  const prevIntentsRef = useRef(intents);
  const framedRef = useRef(false);

  useEffect(() => {
    // Consume nothing until the viewport exists: an intent batch read before
    // panZoom mounts would silently swallow the arrivals the one-time framing
    // keys on. Unreachable in today's mount order, held as an invariant anyway.
    if (!viewportInitialized) return;
    const previous = prevIntentsRef.current;
    prevIntentsRef.current = intents;
    if (intents === previous) return;

    const fit = shouldFitView({
      intents,
      framed: framedRef.current,
      follow,
      dragActive: dragging.size > 0,
    });
    if (!fit) return;

    framedRef.current = true;
    void fitView({ duration: 0, padding: 0.15 });
  }, [intents, follow, dragging, fitView, viewportInitialized]);
}

/** Host component so the follow hook can live in the React Flow children slot. */
export function CameraFollowHost({
  intents,
  follow,
  dragging,
}: {
  readonly intents: readonly MapChainIntent[];
  readonly follow: boolean;
  readonly dragging: ReadonlySet<number>;
}) {
  useCameraFollow(intents, follow, dragging);
  return null;
}
