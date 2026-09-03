'use client';

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
  const setDrag = useCallback((systemIds: readonly number[], active: boolean) => {
    const next = new Set(draggingRef.current);
    for (const systemId of systemIds) {
      if (active) next.add(systemId);
      else next.delete(systemId);
    }
    draggingRef.current = next;
    setDragging(next);
  }, [draggingRef, setDragging]);

  const draggedIds = (dragged: readonly ChainNode[]) =>
    dragged.flatMap((node) => isStubNodeId(node.id) ? [] : [Number(node.id)]);

  const startDrag = useCallback(
    (dragged: readonly ChainNode[]) => setDrag(draggedIds(dragged), true),
    [setDrag],
  );

  const stopDrag = useCallback(
    (dragged: readonly ChainNode[]) => {
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
