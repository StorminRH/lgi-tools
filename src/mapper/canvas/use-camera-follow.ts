'use client';

// Zero-duration camera fits driven by merge intents. The fit policy — one
// initial framing regardless of the toggle, then follow-gated, drag-suppressed
// refits — lives in `camera-follow-model.ts`, where it is unit-tested. Must
// mount inside `<ReactFlow>`.
//
// Node readiness is required before fitting: ChainHost syncs reconciler
// positions in a parent effect, and child effects run first, so intents can
// arrive a commit before the matching React Flow nodes exist. Waiting on the
// live node list (without consuming the intent batch early) keeps the one-time
// framing and follow refits aimed at the laid-out chain.
import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import type { MapChainIntent } from '../chain/intents';
import type { ChainNode } from './SystemNode';
import { decideCameraFit, planCameraFit } from './camera-follow-model';

/** Applies the tested fit policy to the live viewport. */
function useCameraFollow(
  intents: readonly MapChainIntent[],
  follow: boolean,
  dragging: ReadonlySet<number>,
  nodes: readonly ChainNode[],
): void {
  const { fitView, viewportInitialized } = useReactFlow();
  const prevIntentsRef = useRef(intents);
  const framedRef = useRef(false);

  useEffect(() => {
    // Consume nothing until the viewport exists: an intent batch read before
    // panZoom mounts would silently swallow the arrivals the one-time framing
    // keys on. Unreachable in today's mount order, held as an invariant anyway.
    if (!viewportInitialized) return;
    const plan = planCameraFit(
      decideCameraFit({
        intents,
        previousIntents: prevIntentsRef.current,
        framed: framedRef.current,
        follow,
        dragActive: dragging.size > 0,
        nodeIds: new Set(nodes.map((node) => Number(node.id))),
      }),
    );
    if (plan.consume) prevIntentsRef.current = intents;
    if (!plan.fit) return;
    framedRef.current = true;
    void fitView({ duration: 0, padding: 0.15 });
  }, [intents, follow, dragging, nodes, fitView, viewportInitialized]);
}

/** Host component so the follow hook can live in the React Flow children slot. */
export function CameraFollowHost({
  intents,
  follow,
  dragging,
  nodes,
}: {
  readonly intents: readonly MapChainIntent[];
  readonly follow: boolean;
  readonly dragging: ReadonlySet<number>;
  readonly nodes: readonly ChainNode[];
}) {
  useCameraFollow(intents, follow, dragging, nodes);
  return null;
}
