// Which canvas edges admit the authoring context menu (4.0.4.3.2 ruling D-F).
//
// Right-click replaced the edge-click details card, so this is the one place
// that decides whether a line names an editable connection document. Pure:
// React Flow does not call `preventDefault` for `onEdgeContextMenu` and the
// handler is a thin adapter around this rule.
import type { Id } from '@/data/convex/data-model';
import {
  connectionLifecycleActions,
  type ConnectionAuthoringApi,
} from '../authoring/connection-authoring-api';
import { isHaloEdgeId } from '../chain/nodes';

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
