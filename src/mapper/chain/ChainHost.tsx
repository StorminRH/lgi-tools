'use client';

// The live chain layer: subscriptions in, React Flow nodes and edges out.
//
// Node positions are owned HERE, locally, and the server never sends one (contract HC-1 / decision
// D1). Two mechanisms keep a drag safe from an incoming update:
//   1. While a node is dragging its id is in the drag set, and `syncNodes` keeps the LOCAL position
//      for those ids — so a system arriving or leaving elsewhere cannot snap the node under the
//      pointer back to its reconciled position.
//   2. At drag stop the position is stamped `user` in reconciled state, which protects it
//      permanently from the placement seam.
//
// Everything drawn here comes from the reconciler (contract DC-7). This module reads no Convex page
// directly and adds no mutation surface — the session is read-only.
import { applyNodeChanges, type Edge, type NodeChange, type OnNodeDrag } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConvexAuthed } from '@/data/convex/use-convex-authed';
import { ChainSurface } from '../canvas/ChainSurface';
import type { ChainNode } from '../canvas/SystemNode';
import { NoMapAccess } from './ChainBoundary';
import { buildEdges, syncNodes } from './nodes';
import { useMapChain } from './use-map-chain';

const EMPTY_DRAG_SET: ReadonlySet<number> = new Set();
const EMPTY_NODES: ChainNode[] = [];
const EMPTY_EDGES: Edge[] = [];

/**
 * Renders the live chain, waiting for a Convex identity before subscribing.
 *
 * The websocket connects before Better Auth has minted the JWT, so subscribing immediately would send
 * a gated query with no identity and take an `UNAUTHENTICATED` rejection — which is not a FORBIDDEN
 * revocation and would therefore escape the calm-state boundary to the map error surface. Waiting is
 * also the correct HC-5 behavior: the canvas renders straight away and empty, with no spinner, and
 * nodes arrive when both the identity and the pages do.
 */
export function ChainHost({ mapId }: { readonly mapId: string }) {
  const authed = useConvexAuthed();

  if (!authed) return <ChainSurface nodes={EMPTY_NODES} edges={EMPTY_EDGES} />;
  return <ChainLive mapId={mapId} />;
}

/** Subscribes to one map and renders its live chain on the canvas surface. */
function ChainLive({ mapId }: { readonly mapId: string }) {
  const [dragging, setDragging] = useState<ReadonlySet<number>>(EMPTY_DRAG_SET);
  // Mirrors `dragging` for use inside the sync effect without making the effect depend on it: a drag
  // start must not itself trigger a resync.
  const draggingRef = useRef<ReadonlySet<number>>(EMPTY_DRAG_SET);

  const { access, state, labelOf, pinPlacement } = useMapChain(mapId, dragging);
  const [nodes, setNodes] = useState<ChainNode[]>([]);

  useEffect(() => {
    setNodes((previous) =>
      syncNodes(previous, state.systems, labelOf, draggingRef.current),
    );
  }, [state.systems, labelOf]);

  const edges = useMemo(() => buildEdges(state.connections), [state.connections]);

  const onNodesChange = useCallback((changes: NodeChange<ChainNode>[]) => {
    setNodes((previous) => applyNodeChanges(changes, previous));
  }, []);

  const setDrag = useCallback((systemId: number, active: boolean) => {
    const next = new Set(draggingRef.current);
    if (active) next.add(systemId);
    else next.delete(systemId);
    draggingRef.current = next;
    setDragging(next);
  }, []);

  const onNodeDragStart = useCallback<OnNodeDrag<ChainNode>>(
    (_event, node) => setDrag(Number(node.id), true),
    [setDrag],
  );

  const onNodeDragStop = useCallback<OnNodeDrag<ChainNode>>(
    (_event, node) => {
      pinPlacement(Number(node.id), node.position);
      setDrag(Number(node.id), false);
    },
    [pinPlacement, setDrag],
  );

  // Revoked-versus-empty comes from the access subscription, never from a row count (DC-4). It is
  // live, so a re-granted claim brings the map back here without a reload. `undefined` is "not yet
  // answered" and renders the ordinary empty canvas rather than a loading state (HC-5).
  if (access === false) return <NoMapAccess />;

  return (
    <ChainSurface
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
    />
  );
}
