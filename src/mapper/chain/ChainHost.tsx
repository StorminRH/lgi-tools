'use client';

// The live chain layer: subscriptions in, React Flow nodes and edges out.
//
// Node positions are owned HERE, locally, and the server never sends one (contract HC-1 / decision
// D1). Two mechanisms keep a drag safe from an incoming update:
//   1. While a node is dragging its id is in the drag set, and `syncNodes` keeps the LOCAL position
//      for those ids — so a system arriving or leaving elsewhere cannot snap the node under the
//      pointer back to its reconciled position.
//   2. At drag stop the position is stamped `user` in reconciled state, which protects it
//      from the placement seam until re-lock clears every user stamp.
//
// Everything drawn here comes from the reconciler (contract DC-7). This module reads no Convex page
// directly and adds no mutation surface — lock, dials, and camera follow are client-local only.
import {
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type OnNodeDrag,
  type SelectionDragHandler,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConvexAuthed } from '@/data/convex/use-convex-authed';
import { ChainSurface } from '../canvas/ChainSurface';
import { MapControls } from '../canvas/MapControls';
import type { ChainNode } from '../canvas/SystemNode';
import { CameraFollowHost } from '../canvas/use-camera-follow';
import {
  DEFAULT_LAYOUT_CONFIG,
  type LayoutConfig,
} from '../layout/layout-contract';
import { NoMapAccess } from './NoMapAccess';
import { buildEdges, syncNodes } from './nodes';
import { useMapChain } from './use-map-chain';

const EMPTY_DRAG_SET: ReadonlySet<number> = new Set();
const EMPTY_NODES: ChainNode[] = [];
const EMPTY_EDGES: Edge[] = [];

/**
 * Renders the live chain, waiting for a Convex identity before subscribing.
 *
 * This gate is load-bearing and its purpose is easy to mistake. The websocket connects before Better
 * Auth has minted the JWT, and `watchMapAccess` answers an identity-less caller with
 * `{ granted: false }` — a legitimate value, not an error. Subscribing during that window would
 * therefore flash "You've lost access to this map" on every single map open, as a false revocation.
 * Removing this gate does not restore an error; it manufactures a wrong state.
 *
 * Waiting is also the correct HC-5 behavior: the canvas renders straight away and empty, with no
 * spinner, and nodes arrive when both the identity and the pages do.
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
  // Map lock: locked by default — nodes cannot be dragged until the operator unlocks.
  const [locked, setLocked] = useState(true);
  // Camera follow: local, default OFF — the operator's G-1 call (2026-08-02):
  // automatic viewport snapping reads as the camera fighting the user.
  const [follow, setFollow] = useState(false);
  // Live dial state — local presentation only; never synchronized.
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_LAYOUT_CONFIG);

  const {
    access,
    state,
    intents,
    labelOf,
    treeParents,
    pinPlacement,
    releasePlacements,
  } = useMapChain(mapId, dragging, config);
  const [nodes, setNodes] = useState<ChainNode[]>([]);

  useEffect(() => {
    setNodes((previous) =>
      syncNodes(previous, state.systems, labelOf, draggingRef.current),
    );
  }, [state.systems, labelOf]);

  const edges = useMemo(
    () => buildEdges(state.connections, treeParents),
    [state.connections, treeParents],
  );

  const onNodesChange = useCallback((changes: NodeChange<ChainNode>[]) => {
    setNodes((previous) => applyNodeChanges(changes, previous));
  }, []);

  /**
   * Adds or removes a whole gesture's worth of node ids from the drag set.
   *
   * Takes a list, not one id, because one gesture can move several nodes: React Flow's drag driver
   * includes every selected node (`node.selected || node.id === nodeId`) and reports them in the
   * callback's third argument. Protecting only the grabbed node would let an incoming merge snap its
   * companions back out from under the pointer.
   */
  const setDrag = useCallback((systemIds: readonly number[], active: boolean) => {
    const next = new Set(draggingRef.current);
    for (const systemId of systemIds) {
      if (active) next.add(systemId);
      else next.delete(systemId);
    }
    draggingRef.current = next;
    setDragging(next);
  }, []);

  /** Every node one gesture is moving, which is the selection when there is one. */
  const draggedIds = (dragged: readonly ChainNode[]) =>
    dragged.map((node) => Number(node.id));

  const startDrag = useCallback(
    (dragged: readonly ChainNode[]) => setDrag(draggedIds(dragged), true),
    [setDrag],
  );

  const stopDrag = useCallback(
    (dragged: readonly ChainNode[]) => {
      // Pin every node the gesture moved. Pinning only the grabbed one would leave its companions
      // unstamped, and the very next merge would return them to their assigner positions.
      for (const node of dragged) pinPlacement(Number(node.id), node.position);
      setDrag(draggedIds(dragged), false);
    },
    [pinPlacement, setDrag],
  );

  const onNodeDragStart = useCallback<OnNodeDrag<ChainNode>>(
    (_event, node, nodes) => startDrag(nodes.length > 0 ? nodes : [node]),
    [startDrag],
  );

  const onNodeDragStop = useCallback<OnNodeDrag<ChainNode>>(
    (_event, node, nodes) => stopDrag(nodes.length > 0 ? nodes : [node]),
    [stopDrag],
  );

  // Dragging the selection rectangle itself reports only the moved set.
  const onSelectionDragStart = useCallback<SelectionDragHandler<ChainNode>>(
    (_event, nodes) => startDrag(nodes),
    [startDrag],
  );

  const onSelectionDragStop = useCallback<SelectionDragHandler<ChainNode>>(
    (_event, nodes) => stopDrag(nodes),
    [stopDrag],
  );

  const handleLockedChange = useCallback(
    (nextLocked: boolean) => {
      setLocked(nextLocked);
      if (nextLocked) releasePlacements();
    },
    [releasePlacements],
  );

  // Revoked-versus-empty comes from the access subscription, never from a row count (DC-4). It is
  // live, so a re-granted claim brings the map back here without a reload. `undefined` is "not yet
  // answered" and renders the ordinary empty canvas rather than a loading state (HC-5).
  if (access === false) return <NoMapAccess />;

  return (
    <ChainSurface
      nodes={nodes}
      edges={edges}
      nodesDraggable={!locked}
      onNodesChange={onNodesChange}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onSelectionDragStart={onSelectionDragStart}
      onSelectionDragStop={onSelectionDragStop}
    >
      <MapControls
        locked={locked}
        onLockedChange={handleLockedChange}
        follow={follow}
        onFollowChange={setFollow}
        config={config}
        onConfigChange={setConfig}
      />
      <CameraFollowHost
        intents={intents}
        follow={follow}
        dragging={dragging}
        nodes={nodes}
      />
    </ChainSurface>
  );
}
