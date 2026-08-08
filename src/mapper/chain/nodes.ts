// Reconciled state → React Flow nodes and edges. Pure, so the drag-protection rule that carries
// contract DC-2 is a unit test rather than a browser observation.
//
// This is the ONLY place canvas nodes and edges are built, and it builds them solely from reconciler
// output (contract DC-7). Nothing here reads a Convex page.
import {
  CHAIN_NODE_TYPE,
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
  type ChainNode,
} from '../canvas/SystemNode';
import {
  chainTombstoneState,
  type ChainTombstoneState,
} from '@/data/maps/chain-contract';
import type { HaloLink, PlacedHaloSystem } from '../halo/halo-model';
import { pairKey } from '../lib/pair-key';
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
  /** Present only on derived halo gate links; authored connections carry none. */
  readonly halo?: true;
  /**
   * Present when exactly one endpoint sits under the fog (halo-model never
   * links two fogged systems): the renderer truncates the line so it visibly
   * runs into the cloud instead of reaching the invisible endpoint (OW4).
   */
  readonly fogSide?: 'source' | 'target';
  readonly motion?: EdgeMotion;
};

/**
 * Id prefix for derived halo gate links. Authored edge ids are Convex
 * document ids, which can never start with this, so the two id families
 * cannot collide and interaction seams can cheaply tell them apart.
 */
export const HALO_EDGE_ID_PREFIX = 'halo:';

/** Whether one canvas edge id names a derived halo gate link. */
export function isHaloEdgeId(edgeId: string): boolean {
  return edgeId.startsWith(HALO_EDGE_ID_PREFIX);
}

/** One edge on the canvas. Structural subset of React Flow's `Edge`. */
export interface ChainEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly data: ChainEdgeData;
}

/**
 * Every chain node's wrapper style: pointer-inert. Inline on the node object,
 * not a stylesheet rule, for the same reason ghosts do it (motion-host-model):
 * React Flow computes a truthy inline `pointerEvents` once `onNodeClick` is
 * forwarded, and only the node-level style spread wins over it. The visible
 * chrome (name, disc) re-enables its own pointer events inside `SystemNode`,
 * so the invisible widget-frame margin never catches clicks, drags, or hovers
 * — pointer activity there falls through to the pane — while ghosts and the
 * fogged ring re-enable nothing and stay fully inert.
 */
const INERT_NODE_STYLE = { pointerEvents: 'none' } as const;

/**
 * Sheds the derived-node control fields a halo node carries. Load-bearing on
 * the upgrade path: a jump authoring a system already rendered in the halo
 * reuses the same node id, and spreading the retained halo node unchanged
 * would leave the newly authored system undraggable or unselectable. The
 * wrapper style stays: every node is pointer-inert at the wrapper
 * (`INERT_NODE_STYLE`), and interactivity is the chrome's to re-enable.
 */
function stripDerivedControls(node: ChainNode): ChainNode {
  if (node.draggable === undefined && node.selectable === undefined) {
    return node;
  }
  const { draggable: _draggable, selectable: _selectable, ...rest } = node;
  return rest;
}

/**
 * Rebuilds the node list from reconciled state, preserving the live position of any dragging node,
 * then appends the derived halo systems.
 *
 * Arrivals, departures, and labels follow reconciled state exactly. Positions do not: an id in
 * `dragging` keeps whatever position the pointer has given it, which is what makes an incoming
 * update unable to reposition a node being dragged (contract DC-2 / HC-1). A node that is not
 * dragging takes its reconciled position, which is already the user's own once stamped at drag stop.
 *
 * Halo nodes are the kernel's, never the user's: they declare the same frame
 * dimensions (so edges, fits, and followers see the box before measurement),
 * are never draggable, and the fogged ring is inert and unselectable. A halo
 * system whose id is already reconciled contributes nothing — the authored
 * node owns the id, which is what makes the derived → authored upgrade a
 * single node's field change rather than a duplicate.
 */
export function syncNodes(
  previous: readonly ChainNode[],
  systems: ChainState['systems'],
  labelOf: (systemId: number) => SystemLabel,
  dragging: ReadonlySet<number>,
  halo: readonly PlacedHaloSystem[] = [],
): ChainNode[] {
  const localById = new Map(previous.map((node) => [node.id, node]));

  const authored = [...systems.values()].map((placed): ChainNode => {
    const id = String(placed.systemId);
    const local = localById.get(id);
    const holdLocal = local !== undefined && dragging.has(placed.systemId);
    const label = labelOf(placed.systemId);

    // Spread the retained node first so React Flow's own per-node state survives a merge — `selected`
    // above all, plus measured dimensions. Rebuilding a bare literal would silently clear the user's
    // selection every time any unrelated system arrived or left.
    return {
      ...(local === undefined ? undefined : stripDerivedControls(local)),
      id,
      type: CHAIN_NODE_TYPE,
      // The widget frame is declared data-side so React Flow sizes the wrapper
      // (and edges, fits, and followers see the box) before DOM measurement.
      width: SYSTEM_FRAME_WIDTH,
      height: SYSTEM_FRAME_HEIGHT,
      position: holdLocal ? local.position : placed.position,
      style: INERT_NODE_STYLE,
      data: { name: label.name, className: label.className },
    };
  });

  const haloNodes = halo
    .filter((placed) => !systems.has(placed.systemId))
    .map((placed): ChainNode => {
      const id = String(placed.systemId);
      const local = localById.get(id);
      const label = labelOf(placed.systemId);
      const node: ChainNode = {
        ...(local === undefined ? undefined : stripDerivedControls(local)),
        id,
        type: CHAIN_NODE_TYPE,
        width: SYSTEM_FRAME_WIDTH,
        height: SYSTEM_FRAME_HEIGHT,
        // The kernel always owns derived positions; nothing persists them.
        position: placed.position,
        draggable: false,
        style: INERT_NODE_STYLE,
        data: {
          name: label.name,
          className: label.className,
          halo: { ring: placed.ring, fogged: placed.fogged },
        },
      };
      if (!placed.fogged) return node;
      return {
        ...node,
        selected: false,
        selectable: false,
      };
    });

  return [...authored, ...haloNodes];
}

const EMPTY_FOGGED_IDS: ReadonlySet<number> = new Set();

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
  haloLinks: readonly HaloLink[] = [],
  foggedSystemIds: ReadonlySet<number> = EMPTY_FOGGED_IDS,
): ChainEdge[] {
  const claim = newPairClaim(treeParents);
  const edges: ChainEdge[] = [];
  for (const connection of connections.values()) {
    const { fromSystemId, toSystemId } = connection;

    // Skeletons never render, so they must not claim the pair key either —
    // a claimed-then-dropped skeleton would force the surviving connection
    // on the same endpoints to draw dashed as a loop closure.
    const tombstoneState = chainTombstoneState(connection, now);
    if (tombstoneState === 'skeleton') continue;

    const solid = claim.claimSolid(fromSystemId, toSystemId);
    edges.push({
      id: connection.connectionId,
      source: String(fromSystemId),
      target: String(toSystemId),
      data: { loop: !solid, tombstoneState },
    });
  }
  appendHaloEdges(edges, haloLinks, claim, foggedSystemIds);
  return edges;
}

/**
 * The shared solid-claim bookkeeping both edge families use: tree structure
 * draws solid exactly once per endpoint pair, and every rendered pair is
 * remembered so a derived line never doubles an authored one.
 */
function newPairClaim(treeParents: ReadonlyMap<number, number>) {
  const claimed = new Set<string>();
  const rendered = new Set<string>();
  return {
    /** Records the pair as rendered; true when it draws solid (first tree claim). */
    claimSolid(a: number, b: number): boolean {
      const key = pairKey(a, b);
      const isTreeLink = treeParents.get(b) === a || treeParents.get(a) === b;
      const solid = isTreeLink && !claimed.has(key);
      if (solid) claimed.add(key);
      rendered.add(key);
      return solid;
    },
    rendered(a: number, b: number): boolean {
      return rendered.has(pairKey(a, b));
    },
  };
}

/**
 * Derived halo gate links append after every authored connection, sharing
 * the pair-claiming so tree structure stays solid exactly once per pair. A
 * pair an authored line already spans draws nothing extra — the authored
 * connection owns that line.
 */
function appendHaloEdges(
  edges: ChainEdge[],
  haloLinks: readonly HaloLink[],
  claim: ReturnType<typeof newPairClaim>,
  foggedSystemIds: ReadonlySet<number>,
): void {
  for (const link of haloLinks) {
    if (claim.rendered(link.a, link.b)) continue;
    const aFogged = foggedSystemIds.has(link.a);
    const bFogged = foggedSystemIds.has(link.b);
    // Claim links stay in layout facts to place deeper rings, but a canvas
    // edge with both endpoints under fog has no visible side to truncate.
    if (aFogged && bFogged) continue;
    const solid = claim.claimSolid(link.a, link.b);
    const fogSide = aFogged ? ('source' as const) : bFogged ? ('target' as const) : undefined;
    edges.push({
      id: `${HALO_EDGE_ID_PREFIX}${link.a}>${link.b}`,
      source: String(link.a),
      target: String(link.b),
      data: { loop: !solid, halo: true, ...(fogSide === undefined ? {} : { fogSide }) },
    });
  }
}
