'use client';

// While a node is dragging, `syncNodes` keeps the LOCAL position for those
// ids so a system arriving or leaving elsewhere cannot snap the node under
// the pointer back to its reconciled position (HC-1).
import {
  applyNodeChanges,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { ChainNode } from '../canvas/SystemNode';
import type { PlacedHalo } from '../halo/halo-model';
import type { MotionTruth } from '../motion/motion-host-model';
import type { SystemLabel } from './labels';
import { buildEdges, isStubNodeId, syncNodes, type PlacedStub } from './nodes';
import type { ChainState } from './reconciler';

export function useChainNodeSync(
  state: ChainState,
  labelOf: (systemId: number) => SystemLabel,
  halo: PlacedHalo,
  stubs: readonly PlacedStub[],
  treeParents: ReadonlyMap<number, number>,
  connectionPresentationNow: number,
  draggingRef: RefObject<ReadonlySet<number>>,
) {
  const [nodes, setNodes] = useState<ChainNode[]>([]);

  useEffect(() => {
    setNodes((previous) =>
      syncNodes(
        previous,
        state.systems,
        labelOf,
        draggingRef.current,
        halo.systems,
        stubs,
      ),
    );
  }, [state.systems, labelOf, halo.systems, stubs, draggingRef]);

  // Which halo systems sit under the fog — the edge builder truncates lines
  // into the cloud, and the arrow derivation excludes them from the drawn set.
  const foggedSystemIds = useMemo(() => {
    const fogged = new Set<number>();
    for (const system of halo.systems) {
      if (system.fogged) fogged.add(system.systemId);
    }
    return fogged;
  }, [halo.systems]);

  const edges = useMemo(
    () =>
      buildEdges(
        state.connections,
        treeParents,
        connectionPresentationNow,
        halo.links,
        foggedSystemIds,
        stubs,
      ),
    [
      state.connections,
      treeParents,
      connectionPresentationNow,
      halo.links,
      foggedSystemIds,
      stubs,
    ],
  );

  // The non-fogged rendered set the outbound-arrow derivation walks from:
  // authored systems plus drawn halo rings (fogged-ring systems excluded,
  // so a pilot under fog resolves to the boundary arrow, never a hidden badge).
  const drawnSystemIds = useMemo(() => {
    const drawn = new Set<number>(state.systems.keys());
    for (const system of halo.systems) {
      if (!system.fogged) drawn.add(system.systemId);
    }
    return drawn;
  }, [state.systems, halo.systems]);

  // The truth arrays the motion layer derives from — identity changes exactly
  // when a member does, so the derivation re-runs per commit, not per render.
  const truth = useMemo<MotionTruth>(
    () => ({ nodes, edges, treeParents }),
    [nodes, edges, treeParents],
  );

  const onNodesChange = useCallback((changes: NodeChange<ChainNode>[]) => {
    setNodes((previous) => applyNodeChanges(changes, previous));
  }, []);

  const deselectNodes = useCallback(() => {
    setNodes((previous) => {
      const changes: NodeChange<ChainNode>[] = previous
        .filter((node) => node.selected)
        .map((node) => ({ id: node.id, type: 'select', selected: false }));
      return changes.length === 0 ? previous : applyNodeChanges(changes, previous);
    });
  }, []);

  // Id-derived (the join key), so per-frame drag renders reuse the same set
  // and the camera host's effects don't churn (drag hardening, IS-5).
  const nodeIdsKey = nodes
    .flatMap((node) => isStubNodeId(node.id) ? [] : [node.id])
    .join(',');
  const nodeIds = useMemo(
    () =>
      new Set(
        nodeIdsKey.length === 0 ? [] : nodeIdsKey.split(',').map(Number),
      ),
    [nodeIdsKey],
  );

  return {
    deselectNodes,
    drawnSystemIds,
    edges,
    nodeIds,
    nodes,
    onNodesChange,
    truth,
  };
}
