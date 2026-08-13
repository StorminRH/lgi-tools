'use client';

// The chain host's transient authoring anchors: the node menu, the connection
// line's Edit/Delete menu, and the scanner panel's single open target
// (connection edit or read-only site view).
//
// Pointer menus share one rule: losing edit rights must drop every one of
// them. A pointer menu unmounts before its own `onOpenChange` can fire, so a
// stale anchor would re-mount the menu open at old coordinates the moment
// rights came back. Connection edit targets clear with rights; site views
// stay open for read-only viewers.
import { useCallback, useState } from 'react';
import type { Id } from '@/data/convex/data-model';
import type { NodeMenuAnchor } from '../authoring/NodeAddMenu';
import type { EdgeMenuAnchor } from '../canvas/edge-menu';
import type { ScannerPanelTarget } from '../signatures/signature-context';

/** The host's transient authoring anchors and their setters. */
export interface AuthoringMenus {
  readonly nodeMenu: NodeMenuAnchor | null;
  readonly edgeMenu: EdgeMenuAnchor | null;
  readonly panelTarget: ScannerPanelTarget;
  /** Opening either menu closes the other — one pointer, one menu. */
  readonly openNodeMenu: (anchor: NodeMenuAnchor) => void;
  readonly openEdgeMenu: (anchor: EdgeMenuAnchor) => void;
  readonly closeNodeMenu: () => void;
  readonly closeEdgeMenu: () => void;
  readonly setPanelTarget: (target: ScannerPanelTarget) => void;
  /** Edge-menu adapter: open the connection editor body. */
  readonly setEditingConnectionId: (
    connectionId: Id<'mapConnections'> | null,
  ) => void;
}

/** Owns the host's pointer-menu anchors and the open scanner panel target. */
export function useAuthoringMenus(canEdit: boolean | undefined): AuthoringMenus {
  const [nodeMenu, setNodeMenu] = useState<NodeMenuAnchor | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenuAnchor | null>(null);
  const [panelTarget, setPanelTarget] = useState<ScannerPanelTarget>(null);

  // Guarded adjust-during-render: React bails out when a state value is
  // already what it is being set to, so clearing unconditionally is cheap.
  const [prevCanEdit, setPrevCanEdit] = useState(canEdit);
  if (prevCanEdit !== canEdit) {
    setPrevCanEdit(canEdit);
    if (canEdit !== true) {
      setNodeMenu(null);
      setEdgeMenu(null);
      // Site views are read-only — keep them when edit rights drop.
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
