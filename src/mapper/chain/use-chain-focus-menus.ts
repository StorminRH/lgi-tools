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
  menus: AuthoringMenus,
  mapId: string,
  authoring: ChainAuthoringMutations,
  focusTokenRef: RefObject<number>,
  setFocusRequest: (request: CameraFocusRequest | null) => void,
) {
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
      menus.openNodeMenu({
        systemId: Number(node.id),
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [canEdit, menus],
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
      menus.openEdgeMenu({
        connectionId,
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [canEdit, menus],
  );

  const edgeActions = useMemo(
    () =>
      edgeMenuActions({
        mapId,
        authoring,
        openEditor: menus.setEditingConnectionId,
        closeEditor: () => menus.setEditingConnectionId(null),
        closeMenu: menus.closeEdgeMenu,
      }),
    [mapId, authoring, menus],
  );

  return {
    edgeActions,
    onEdgeContextMenu,
    onNodeClick,
    onNodeContextMenu,
  };
}
