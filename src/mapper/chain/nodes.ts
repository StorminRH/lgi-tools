// Reconciled state → React Flow nodes and edges. Pure, so the drag-protection rule that carries
// contract DC-2 is a unit test rather than a browser observation.
//
// This is the ONLY place canvas nodes and edges are built, and it builds them solely from reconciler
// output (contract DC-7). Nothing here reads a Convex page.
import { CHAIN_NODE_TYPE, type ChainNode } from '../canvas/SystemNode';
import {
  chainTombstoneState,
  type ChainTombstoneState,
} from '@/data/maps/chain-contract';
import type { EdgeMotion } from '../motion/motion-contract';
import type { SystemLabel } from './labels';
import type { ChainState } from './reconciler';

/**
 * The chain edge payload — the one shape both the builder and renderer type
 * against. `buildEdges` never sets `motion` — reconciled truth carries no
 * motion; the vocabulary (`EdgeMotion`) is owned by `../motion/motion-contract`
 * and the field is written only by the motion derivation.
 */
export type ChainEdgeData = {
  /** `loop: true` marks a non-tree connection (loop closure); drawn dashed. */
  readonly loop: boolean;
  /** Active edges render normally; dying edges render restorable; skeletons never render. */
  readonly tombstoneState?: Exclude<ChainTombstoneState, 'skeleton'>;
  readonly motion?: EdgeMotion;
};

/** One edge on the canvas. Structural subset of React Flow's `Edge`. */
export interface ChainEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly data: ChainEdgeData;
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

    // Spread the retained node first so React Flow's own per-node state survives a merge — `selected`
    // above all, plus measured dimensions. Rebuilding a bare literal would silently clear the user's
    // selection every time any unrelated system arrived or left.
    return {
      ...local,
      id,
      type: CHAIN_NODE_TYPE,
      position: holdLocal ? local.position : placed.position,
      data: { name: label.name, className: label.className },
    };
  });
}

/**
 * Builds one edge per visible connection; withheld connections are simply absent from state.
 *
 * A connection is a TREE link — drawn solid — when it realizes a parent/child
 * relationship from the kernel's own derivation, and only the first connection
 * between that pair (map order is known-document creation order) claims it; a
 * duplicate between the same pair, and every loop closure, draws dashed. The
 * classification input is deterministic shared state, so two clients can never
 * disagree about which lines are structure.
 */
export function buildEdges(
  connections: ChainState['connections'],
  treeParents: ReadonlyMap<number, number>,
  now = Date.now(),
): ChainEdge[] {
  const claimed = new Set<string>();
  const edges: ChainEdge[] = [];
  for (const connection of connections.values()) {
    const { fromSystemId, toSystemId } = connection;
    const isTreeLink =
      treeParents.get(toSystemId) === fromSystemId ||
      treeParents.get(fromSystemId) === toSystemId;
    const pairKey =
      fromSystemId < toSystemId
        ? `${fromSystemId}>${toSystemId}`
        : `${toSystemId}>${fromSystemId}`;

    // Skeletons never render, so they must not claim the pair key either —
    // a claimed-then-dropped skeleton would force the surviving connection
    // on the same endpoints to draw dashed as a loop closure.
    const tombstoneState = chainTombstoneState(connection, now);
    if (tombstoneState === 'skeleton') continue;

    const solid = isTreeLink && !claimed.has(pairKey);
    if (solid) claimed.add(pairKey);

    edges.push({
      id: connection.connectionId,
      source: String(fromSystemId),
      target: String(toSystemId),
      data: { loop: !solid, tombstoneState },
    });
  }
  return edges;
}
