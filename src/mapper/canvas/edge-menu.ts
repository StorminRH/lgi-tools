// Which canvas edges admit the authoring context menu (4.0.4.3.2 ruling D-F).
//
// Right-click replaced the edge-click details card, so this is the one place
// that decides whether a line names an editable connection document. Pure:
// React Flow does not call `preventDefault` for `onEdgeContextMenu` and the
// handler is a thin adapter around this rule.
import type { Id } from '@/data/convex/data-model';
import { isHaloEdgeId, type ChainEdge } from '../chain/nodes';
import {
  connectionLifecycleActions,
  type ConnectionAuthoringApi,
} from '../signatures/connection-authoring-api';

/** One opened edge menu: the connection it acts on and where it was opened. */
export interface EdgeMenuAnchor {
  readonly connectionId: Id<'mapConnections'>;
  readonly clientX: number;
  readonly clientY: number;
}

/**
 * The connection document one right-clicked edge names, or `null` when the
 * line carries no authority to act on.
 *
 * Viewers get nothing. Derived halo gate links and unresolved-wormhole stubs
 * are rendered, never written (HC-2) — a stub's own row is edited from the
 * scanner, not from the line drawn for it. Every remaining edge id is a Convex
 * connection id by construction (`buildEdges`).
 */
export function edgeMenuConnectionId(input: {
  readonly edgeId: string;
  readonly stub: boolean;
  readonly canEdit: boolean;
}): Id<'mapConnections'> | null {
  if (!input.canEdit) return null;
  if (isHaloEdgeId(input.edgeId) || input.stub) return null;
  return input.edgeId as Id<'mapConnections'>;
}

/**
 * Whether this line should stay hit-testable. Same authority as the context
 * menu, plus departing ghosts — a fading stroke is not an authoring surface.
 *
 * React Flow marks unselectable edges inactive (pointer-events none on the
 * wrapper group), so the pane pans through. Path CSS alone cannot do that:
 * edge.style lands on the visible stroke, not the wrapper.
 */
export function edgeAllowsPointerActions(
  edge: ChainEdge,
  canEdit: boolean,
): boolean {
  if (edge.data.motion?.phase === 'departing') return false;
  return (
    edgeMenuConnectionId({
      edgeId: edge.id,
      stub: edge.data.stub === true,
      canEdit,
    }) !== null
  );
}

/**
 * Stamps RF hit-testing from `edgeAllowsPointerActions`. Actionable lines keep
 * the library default (selectable) so `onEdgeContextMenu` still fires; every
 * other line is inert. Identity-stable when the flags are already correct.
 */
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

/** What the two menu rows do; the host supplies only its own state seams. */
export interface EdgeMenuActions {
  readonly onEdit: (anchor: EdgeMenuAnchor) => void;
  readonly onDelete: (anchor: EdgeMenuAnchor) => void;
}

/**
 * Binds Edit and Delete to the map's one editor and the one connection
 * lifecycle owner — the menu adds an entry point, never a second removal rule.
 */
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
        // A removed connection has no editor to stay open on.
        onDone: input.closeEditor,
      }).remove();
    },
  };
}
