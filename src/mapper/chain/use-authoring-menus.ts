'use client';

import { useCallback, useState } from 'react';
import type { Id } from '@/data/convex/data-model';
import type { NodeMenuAnchor } from '../authoring/NodeAddMenu';
import type { EdgeMenuAnchor } from '../canvas/edge-menu';
import type { ScannerPanelTarget } from '../signatures/signature-context';

export interface AuthoringMenus {
  readonly nodeMenu: NodeMenuAnchor | null;
  readonly edgeMenu: EdgeMenuAnchor | null;
  readonly panelTarget: ScannerPanelTarget;

  readonly openNodeMenu: (anchor: NodeMenuAnchor) => void;
  readonly openEdgeMenu: (anchor: EdgeMenuAnchor) => void;
  readonly closeNodeMenu: () => void;
  readonly closeEdgeMenu: () => void;
  readonly setPanelTarget: (target: ScannerPanelTarget) => void;

  readonly setEditingConnectionId: (
    connectionId: Id<'mapConnections'> | null,
  ) => void;
}

export function useAuthoringMenus(canEdit: boolean | undefined): AuthoringMenus {
  const [nodeMenu, setNodeMenu] = useState<NodeMenuAnchor | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenuAnchor | null>(null);
  const [panelTarget, setPanelTarget] = useState<ScannerPanelTarget>(null);

  const [prevCanEdit, setPrevCanEdit] = useState(canEdit);
  if (prevCanEdit !== canEdit) {
    setPrevCanEdit(canEdit);
    if (canEdit !== true) {
      setNodeMenu(null);
      setEdgeMenu(null);

      if (panelTarget?.kind === 'connection') setPanelTarget(null);
    }
  }

  const openNodeMenu = useCallback((anchor: NodeMenuAnchor) => {
    setEdgeMenu(null);
    setNodeMenu(anchor);
  }, []);
  const openEdgeMenu = useCallback((anchor: EdgeMenuAnchor) => {
    setNodeMenu(null);
    setEdgeMenu(anchor);
  }, []);
  const closeNodeMenu = useCallback(() => setNodeMenu(null), []);
  const closeEdgeMenu = useCallback(() => setEdgeMenu(null), []);
  const setEditingConnectionId = useCallback(
    (connectionId: Id<'mapConnections'> | null) => {
      setPanelTarget(
        connectionId === null
          ? null
          : { kind: 'connection', connectionId, signatureId: null },
      );
    },
    [],
  );

  return {
    nodeMenu,
    edgeMenu,
    panelTarget,
    openNodeMenu,
    openEdgeMenu,
    closeNodeMenu,
    closeEdgeMenu,
    setPanelTarget,
    setEditingConnectionId,
  };
}
