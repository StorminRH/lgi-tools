'use client';

// At drag stop the position is stamped `user` in reconciled state, which
// protects it from the placement seam until re-lock clears every user stamp.
import {
  type OnNodeDrag,
  type SelectionDragHandler,
} from '@xyflow/react';
import { useCallback, type RefObject } from 'react';
import type { ChainNode } from '../canvas/SystemNode';
import type { ChainPosition } from './intents';
import { isStubNodeId } from './nodes';

export function useChainDrag(
  draggingRef: RefObject<ReadonlySet<number>>,
  setDragging: (next: ReadonlySet<number>) => void,
  pinPlacement: (systemId: number, position: ChainPosition) => void,
) {
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
  }, [draggingRef, setDragging]);

  /** Every node one gesture is moving, which is the selection when there is one. */
  const draggedIds = (dragged: readonly ChainNode[]) =>
    dragged.flatMap((node) => isStubNodeId(node.id) ? [] : [Number(node.id)]);

  const startDrag = useCallback(
    (dragged: readonly ChainNode[]) => setDrag(draggedIds(dragged), true),
    [setDrag],
  );

  const stopDrag = useCallback(
    (dragged: readonly ChainNode[]) => {
      // Pin every node the gesture moved. Pinning only the grabbed one would leave its companions
      // unstamped, and the very next merge would return them to their assigner positions.
      for (const node of dragged) {
        if (!isStubNodeId(node.id)) pinPlacement(Number(node.id), node.position);
      }
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

  return {
    onNodeDragStart,
    onNodeDragStop,
    onSelectionDragStart,
    onSelectionDragStop,
  };
}
