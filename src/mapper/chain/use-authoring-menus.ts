'use client';

// The chain host's transient authoring anchors: the node menu, the connection
// line's Edit/Delete menu, and which connection the map's one Signature Editor
// is open on.
//
// They live together because they share one rule: losing edit rights must drop
// every one of them. A pointer menu unmounts before its own `onOpenChange` can
// fire, so a stale anchor would re-mount the menu open at old coordinates the
// moment rights came back.
import { useCallback, useState } from 'react';
import type { Id } from '@/data/convex/data-model';
import type { NodeMenuAnchor } from '../authoring/NodeAddMenu';
import type { EdgeMenuAnchor } from '../canvas/edge-menu';

/** The host's transient authoring anchors and their setters. */
export interface AuthoringMenus {
  readonly nodeMenu: NodeMenuAnchor | null;
  readonly edgeMenu: EdgeMenuAnchor | null;
  readonly editingConnectionId: Id<'mapConnections'> | null;
  /** Opening either menu closes the other — one pointer, one menu. */
  readonly openNodeMenu: (anchor: NodeMenuAnchor) => void;
  readonly openEdgeMenu: (anchor: EdgeMenuAnchor) => void;
  readonly closeNodeMenu: () => void;
  readonly closeEdgeMenu: () => void;
  readonly setEditingConnectionId: (
    connectionId: Id<'mapConnections'> | null,
  ) => void;
}

/** Owns the host's pointer-menu anchors and the open editor's subject. */
export function useAuthoringMenus(canEdit: boolean | undefined): AuthoringMenus {
  const [nodeMenu, setNodeMenu] = useState<NodeMenuAnchor | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenuAnchor | null>(null);
  const [editingConnectionId, setEditingConnectionId] = useState<
    Id<'mapConnections'> | null
  >(null);

  // Guarded adjust-during-render: React bails out when a state value is
  // already what it is being set to, so clearing unconditionally is cheap.
  const [prevCanEdit, setPrevCanEdit] = useState(canEdit);
  if (prevCanEdit !== canEdit) {
    setPrevCanEdit(canEdit);
    if (canEdit !== true) {
      setNodeMenu(null);
      setEdgeMenu(null);
      setEditingConnectionId(null);
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

  return {
    nodeMenu,
    edgeMenu,
    editingConnectionId,
    openNodeMenu,
    openEdgeMenu,
    closeNodeMenu,
    closeEdgeMenu,
    setEditingConnectionId,
  };
}
