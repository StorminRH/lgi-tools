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
import { applyNodeChanges, type NodeChange, type OnNodeDrag } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChainSurface } from '../canvas/ChainSurface';
import type { ChainNode } from '../canvas/SystemNode';
import { buildEdges, syncNodes } from './nodes';
import { useMapChain } from './use-map-chain';

const EMPTY_DRAG_SET: ReadonlySet<number> = new Set();

/** Subscribes to one map and renders its live chain on the canvas surface. */
export function ChainHost({ mapId }: { readonly mapId: string }) {
  const [dragging, setDragging] = useState<ReadonlySet<number>>(EMPTY_DRAG_SET);
  // Mirrors `dragging` for use inside the sync effect without making the effect depend on it: a drag
  // start must not itself trigger a resync.
  const draggingRef = useRef<ReadonlySet<number>>(EMPTY_DRAG_SET);

  const { state, labelOf, pinPlacement } = useMapChain(mapId, dragging);
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
