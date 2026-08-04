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
  ReactFlowProvider,
  type Edge,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  type SelectionDragHandler,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useConvexAuthed } from '@/data/convex/use-convex-authed';
import type { Id } from '@/data/convex/data-model';
import { ConnectionAuthoringOverlay } from '../authoring/ConnectionAuthoringOverlay';
import { HomePrompt } from '../authoring/HomePrompt';
import {
  NodeAddMenu,
  type NodeMenuAnchor,
} from '../authoring/NodeAddMenu';
import { RightsTransitionToast } from '../authoring/RightsTransitionToast';
import { ChainSurface, type ChainSurfaceProps } from '../canvas/ChainSurface';
import { MapControls } from '../canvas/MapControls';
import type { ChainNode } from '../canvas/SystemNode';
import {
  CameraFollowHost,
  type CameraFocusRequest,
} from '../canvas/use-camera-follow';
import {
  DEFAULT_LAYOUT_CONFIG,
  type LayoutConfig,
} from '../layout/layout-contract';
import {
  DEFAULT_MOTION_CONFIG,
  type MotionConfig,
} from '../motion/motion-contract';
import type { MotionTruth } from '../motion/motion-host-model';
import { BROWSER_MOTION_SEAMS, useMotion } from '../motion/use-motion';
import { MapWindowLayer } from '../windows/MapWindowLayer';
import type { RootClickSignal } from '../windows/window-model';
import type { MapChainIntent } from './intents';
import { NoMapAccess } from './NoMapAccess';
import { buildEdges, syncNodes } from './nodes';
import { useChainAuthoringMutations } from './optimistic-authoring';
import { useMapChain, type MapAccessState } from './use-map-chain';

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
  // Click-to-focus: a shipped user setting beside camera follow — deliberately
  // NOT a MotionConfig dial. Default ON ratified at the G-1 gate (2026-08-02):
  // unlike follow, focus is a direct answer to the user's own click, so it
  // does not read as the camera moving on its own; it stays user-changeable.
  const [focusOnClick, setFocusOnClick] = useState(true);
  const [focusRequest, setFocusRequest] = useState<CameraFocusRequest | null>(null);
  const [rootClick, setRootClick] = useState<RootClickSignal | null>(null);
  const focusTokenRef = useRef(0);
  // Live dial state — local presentation only; never synchronized.
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_LAYOUT_CONFIG);
  // Motion dials — presentation only, a separate object from LayoutConfig by
  // contract (HC-4): no motion field may enter the layout fingerprint.
  const [motionConfig, setMotionConfig] = useState<MotionConfig>(
    DEFAULT_MOTION_CONFIG,
  );

  const {
    access,
    canEdit,
    systemsComplete,
    liveSystemCount,
    connectionDetails,
    connectionPresentationNow,
    events,
    state,
    intents,
    labelOf,
    treeParents,
    rootSystemId,
    pinPlacement,
    releasePlacements,
  } = useMapChain(mapId, dragging, config);
  const authoring = useChainAuthoringMutations();
  const [nodes, setNodes] = useState<ChainNode[]>([]);
  const [nodeMenu, setNodeMenu] = useState<NodeMenuAnchor | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    Id<'mapConnections'> | null
  >(null);

  useEffect(() => {
    setNodes((previous) =>
      syncNodes(previous, state.systems, labelOf, draggingRef.current),
    );
  }, [state.systems, labelOf]);

  const edges = useMemo(
    () => buildEdges(state.connections, treeParents, connectionPresentationNow),
    [state.connections, treeParents, connectionPresentationNow],
  );

  // The truth arrays the motion layer derives from — identity changes exactly
  // when a member does, so the derivation re-runs per commit, not per render.
  const truth = useMemo<MotionTruth>(
    () => ({ nodes, edges, treeParents }),
    [nodes, edges, treeParents],
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

  // Focus is additive to selection: this handler only records the click for
  // the camera host; React Flow's own selection behavior runs untouched.
  const onNodeClick = useCallback<NodeMouseHandler<ChainNode>>(
    (_event, clicked) => {
      focusTokenRef.current += 1;
      setFocusRequest({ nodeId: clicked.id, token: focusTokenRef.current });
      setRootClick({ systemId: Number(clicked.id), token: focusTokenRef.current });
      setSelectedConnectionId(null);
    },
    [],
  );

  const onNodeContextMenu = useCallback<NodeMouseHandler<ChainNode>>(
    (event, node) => {
      if (canEdit !== true) return;
      event.preventDefault();
      setSelectedConnectionId(null);
      setNodeMenu({
        systemId: Number(node.id),
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [canEdit],
  );

  const onEdgeClick = useCallback<EdgeMouseHandler>(
    (_event, edge) => {
      if (canEdit !== true) return;
      // Edge ids are Convex connection document ids by construction (buildEdges).
      setSelectedConnectionId(edge.id as Id<'mapConnections'>);
    },
    [canEdit],
  );

  const deselectNodes = useCallback(() => {
    setNodes((previous) => {
      const changes: NodeChange<ChainNode>[] = previous
        .filter((node) => node.selected)
        .map((node) => ({ id: node.id, type: 'select', selected: false }));
      return changes.length === 0 ? previous : applyNodeChanges(changes, previous);
    });
  }, []);

  const showHomePrompt =
    canEdit === true && systemsComplete && liveSystemCount === 0;

  // Id-derived (the join key), so per-frame drag renders reuse the same set
  // and the camera host's effects don't churn (drag hardening, IS-5).
  const nodeIdsKey = nodes.map((node) => node.id).join(',');
  const nodeIds = useMemo(
    () =>
      new Set(
        nodeIdsKey.length === 0 ? [] : nodeIdsKey.split(',').map(Number),
      ),
    [nodeIdsKey],
  );

  // Revoked-versus-empty comes from the access subscription, never from a row count (DC-4). It is
  // live, so a re-granted claim brings the map back here without a reload. `undefined` is "not yet
  // answered" and renders the ordinary empty canvas rather than a loading state (HC-5).
  if (access === false) return <NoMapAccess />;

  // `canEdit` reaches the host here so OW4 authoring surfaces can gate
  // affordances from the same live claim answer without a second subscription.
  return (
    <div
      className="h-full w-full"
      data-map-can-edit={canEdit === true ? 'true' : 'false'}
    >
      <ReactFlowProvider initialMinZoom={0.2} initialMaxZoom={2.5}>
        <MotionLayer
          truth={truth}
          intents={intents}
          access={access}
          dragging={dragging}
          motionConfig={motionConfig}
          nodesDraggable={!locked}
          onNodesChange={onNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onSelectionDragStart={onSelectionDragStart}
          onSelectionDragStop={onSelectionDragStop}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeClick={onEdgeClick}
        >
          <MapControls
            locked={locked}
            onLockedChange={handleLockedChange}
            follow={follow}
            onFollowChange={setFollow}
            focusOnClick={focusOnClick}
            onFocusOnClickChange={setFocusOnClick}
            config={config}
            onConfigChange={setConfig}
            motion={motionConfig}
            onMotionChange={setMotionConfig}
          />
          <CameraFollowHost
            intents={intents}
            follow={follow}
            dragging={dragging}
            nodeIds={nodeIds}
            systems={state.systems}
            config={motionConfig}
            prefersReducedMotion={BROWSER_MOTION_SEAMS.prefersReducedMotion}
            focusRequest={focusRequest}
            focusEnabled={focusOnClick}
          />
        </MotionLayer>
        <MapWindowLayer
          rootSystemId={rootSystemId}
          rootClick={rootClick}
          onDeselect={deselectNodes}
        />
        <RightsTransitionToast canEdit={canEdit} />
        <ConnectionAuthoringOverlay
          mapId={mapId}
          canEdit={canEdit === true}
          connectionDetails={connectionDetails}
          connectionPresentationNow={connectionPresentationNow}
          events={events}
          authoring={authoring}
          selectedConnectionId={selectedConnectionId}
          onSelectedConnectionIdChange={setSelectedConnectionId}
        />
        {showHomePrompt ? (
          <HomePrompt
            mapId={mapId}
            onPick={(systemId) => {
              void authoring.setHomeSystem({ mapId, systemId });
            }}
          />
        ) : null}
        {canEdit === true ? (
          <NodeAddMenu
            mapId={mapId}
            menu={nodeMenu}
            onMenuOpenChange={(open) => {
              if (!open) setNodeMenu(null);
            }}
            onAdd={(fromSystemId, toSystemId) => {
              void authoring.addSystemFromNode({
                mapId,
                fromSystemId,
                toSystemId,
              });
            }}
          />
        ) : null}
      </ReactFlowProvider>
    </div>
  );
}

/** What the motion layer needs beyond the surface's own props. */
interface MotionLayerProps
  extends Omit<ChainSurfaceProps, 'nodes' | 'edges' | 'motion'> {
  readonly truth: MotionTruth;
  readonly intents: readonly MapChainIntent[];
  readonly access: MapAccessState;
  readonly dragging: ReadonlySet<number>;
  readonly motionConfig: MotionConfig;
  readonly children?: ReactNode;
}

/**
 * The per-frame render boundary between reconciled truth and the canvas.
 *
 * `useMotion`'s frame loop re-renders THIS component, not `ChainLive`: the
 * children (controls, camera host) are created by the parent, so their element
 * identity is stable across motion frames and React bails out of re-rendering
 * them — the per-frame commit stays proportional to actual movers.
 */
function MotionLayer({
  truth,
  intents,
  access,
  dragging,
  motionConfig,
  children,
  ...surface
}: MotionLayerProps) {
  const presentation = useMotion(
    truth,
    intents,
    access,
    dragging,
    motionConfig,
    BROWSER_MOTION_SEAMS,
  );
  return (
    <ChainSurface
      nodes={presentation.nodes}
      edges={presentation.edges}
      motion={motionConfig}
      {...surface}
    >
      {children}
    </ChainSurface>
  );
}
