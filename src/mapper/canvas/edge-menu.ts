import type { Id } from '@/data/convex/data-model';
import { isHaloEdgeId, type ChainEdge } from '../chain/nodes';
import {
  connectionLifecycleActions,
  type ConnectionAuthoringApi,
} from '../signatures/connection-authoring-api';

export interface EdgeMenuAnchor {
  readonly connectionId: Id<'mapConnections'>;
  readonly clientX: number;
  readonly clientY: number;
}

export function edgeMenuConnectionId(input: {
  readonly edgeId: string;
  readonly stub: boolean;
  readonly canEdit: boolean;
}): Id<'mapConnections'> | null {
  if (!input.canEdit) return null;
  if (isHaloEdgeId(input.edgeId) || input.stub) return null;
  return input.edgeId as Id<'mapConnections'>;
}

export function edgeAllowsPointerActions(
  edge: ChainEdge,
  canEdit: boolean,
): boolean {
  if (edge.data.motion?.phase === 'departing') return false;
  if (edge.data.tombstoneState === 'dying') return false;
  return (
    edgeMenuConnectionId({
      edgeId: edge.id,
      stub: edge.data.stub === true,
      canEdit,
    }) !== null
  );
}

export function withEdgePointerPolicy(
  edges: readonly ChainEdge[],
  canEdit: boolean,
): ChainEdge[] {
  return edges.map((edge) => {
    if (edgeAllowsPointerActions(edge, canEdit)) {
      if (edge.selectable === undefined && edge.focusable === undefined) {
        return edge;
      }
      const { selectable: _selectable, focusable: _focusable, ...rest } = edge;
      return rest;
    }
    if (edge.selectable === false && edge.focusable === false) return edge;
    return { ...edge, selectable: false, focusable: false };
  });
}

export interface EdgeMenuActions {
  readonly onEdit: (anchor: EdgeMenuAnchor) => void;
  readonly onDelete: (anchor: EdgeMenuAnchor) => void;
}

export function edgeMenuActions(input: {
  readonly mapId: string;
  readonly authoring: ConnectionAuthoringApi;
  readonly openEditor: (connectionId: Id<'mapConnections'>) => void;
  readonly closeEditor: () => void;
  readonly closeMenu: () => void;
}): EdgeMenuActions {
  return {
    onEdit: (anchor) => {
      input.closeMenu();
      input.openEditor(anchor.connectionId);
    },
    onDelete: (anchor) => {
      input.closeMenu();
      connectionLifecycleActions({
        mapId: input.mapId,
        connectionId: anchor.connectionId,
        authoring: input.authoring,
        onDone: input.closeEditor,
      }).remove();
    },
  };
}
