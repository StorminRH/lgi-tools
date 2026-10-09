'use client';

import {
  type EdgeMouseHandler,
  type NodeMouseHandler,
} from '@xyflow/react';
import { useCallback, useMemo, type RefObject } from 'react';
import type { ChainNode } from '../canvas/SystemNode';
import type { CameraFocusRequest } from '../canvas/use-camera-follow';
import {
  edgeMenuActions,
  edgeMenuConnectionId,
} from '../canvas/edge-menu';
import { isStubNodeId } from './nodes';
import type { ChainAuthoringMutations } from './optimistic-authoring';
import type { AuthoringMenus } from './use-authoring-menus';

export function useChainFocusMenus(
  canEdit: boolean | undefined,
  menus: Pick<
    AuthoringMenus,
    'openNodeMenu' | 'openEdgeMenu' | 'setEditingConnectionId' | 'closeEdgeMenu'
  >,
  mapId: string,
  authoring: ChainAuthoringMutations,
  focusTokenRef: RefObject<number>,
  setFocusRequest: (request: CameraFocusRequest | null) => void,
) {
  // Depend on the stable callbacks, not the menus object: useAuthoringMenus
  // returns a fresh object every render, and a new handler identity
  // re-renders every memoised React Flow node and edge wrapper.
  const { openNodeMenu, openEdgeMenu, setEditingConnectionId, closeEdgeMenu } =
    menus;

  const onNodeClick = useCallback<NodeMouseHandler<ChainNode>>(
    (_event, clicked) => {
      if (isStubNodeId(clicked.id)) return;
      focusTokenRef.current += 1;
      setFocusRequest({ nodeId: clicked.id, token: focusTokenRef.current });
    },
    [focusTokenRef, setFocusRequest],
  );

  const onNodeContextMenu = useCallback<NodeMouseHandler<ChainNode>>(
    (event, node) => {
      if (canEdit !== true) return;
      if (node.data.halo !== undefined || isStubNodeId(node.id)) return;
      event.preventDefault();
      openNodeMenu({
        systemId: Number(node.id),
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [canEdit, openNodeMenu],
  );

  const onEdgeContextMenu = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      const connectionId = edgeMenuConnectionId({
        edgeId: edge.id,
        stub: edge.data?.stub === true,
        canEdit: canEdit === true,
      });
      if (connectionId === null) return;
      event.preventDefault();
      openEdgeMenu({
        connectionId,
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [canEdit, openEdgeMenu],
  );

  const edgeActions = useMemo(
    () =>
      edgeMenuActions({
        mapId,
        authoring,
        openEditor: setEditingConnectionId,
        closeEditor: () => setEditingConnectionId(null),
        closeMenu: closeEdgeMenu,
      }),
    [mapId, authoring, setEditingConnectionId, closeEdgeMenu],
  );

  return {
    edgeActions,
    onEdgeContextMenu,
    onNodeClick,
    onNodeContextMenu,
  };
}
