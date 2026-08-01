// Reconciled state → React Flow nodes and edges. Pure, so the drag-protection rule that carries
// contract DC-2 is a unit test rather than a browser observation.
//
// This is the ONLY place canvas nodes and edges are built, and it builds them solely from reconciler
// output (contract DC-7). Nothing here reads a Convex page.
import { CHAIN_NODE_TYPE, type ChainNode } from '../canvas/SystemNode';
import type { SystemLabel } from './labels';
import type { ChainState } from './reconciler';

/** One edge on the canvas. Structural subset of React Flow's `Edge`. */
export interface ChainEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

/**
 * Rebuilds the node list from reconciled state, preserving the live position of any dragging node.
 *
 * Arrivals, departures, and labels follow reconciled state exactly. Positions do not: an id in
 * `dragging` keeps whatever position the pointer has given it, which is what makes an incoming
 * update unable to reposition a node being dragged (contract DC-2 / HC-1). A node that is not
 * dragging takes its reconciled position, which is already the user's own once stamped at drag stop.
 */
export function syncNodes(
  previous: readonly ChainNode[],
  systems: ChainState['systems'],
  labelOf: (systemId: number) => SystemLabel,
  dragging: ReadonlySet<number>,
): ChainNode[] {
  const localById = new Map(previous.map((node) => [node.id, node]));

  return [...systems.values()].map((placed) => {
    const id = String(placed.systemId);
    const local = localById.get(id);
    const holdLocal = local !== undefined && dragging.has(placed.systemId);
    const label = labelOf(placed.systemId);

    return {
      id,
      type: CHAIN_NODE_TYPE,
      position: holdLocal ? local.position : placed.position,
      data: { name: label.name, className: label.className },
    };
  });
}

/** Builds one edge per visible connection; withheld connections are simply absent from state. */
export function buildEdges(connections: ChainState['connections']): ChainEdge[] {
  return [...connections.values()].map((connection) => ({
    id: connection.connectionId,
    source: String(connection.fromSystemId),
    target: String(connection.toSystemId),
  }));
}
