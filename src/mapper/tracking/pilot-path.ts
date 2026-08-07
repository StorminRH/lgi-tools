// Pure gate-path derivation for off-map pilots (4.0.4.2.3 OW3).
//
// A tracked pilot standing outside the drawn (non-fogged) rendered set shows
// as a green arrow on the last visible connection line along their gate path,
// pointing into the fog. This module owns the two pure halves: the bounded
// multi-source BFS from the drawn set toward the pilot, and the mount-edge
// resolution that picks which rendered edge carries the arrow. Both are
// deterministic — sources and pilots iterate in ascending numeric order and
// the adjacency asset's neighbour lists are sorted — so every client mounts
// the same arrow on the same line.

/**
 * Bounded search depth for an off-map pilot's gate path. Beyond this many
 * jumps the pilot draws no canvas marker (tracking controls still list them).
 * Pinned; no runtime configuration surface (operator direction, plan PD-2
 * family).
 */
export const PILOT_PATH_MAX_JUMPS = 15;

/** Inputs for one path derivation. */
export interface PilotPathInput {
  /**
   * The non-fogged rendered set: authored systems plus drawn halo rings.
   * Fogged ring systems are excluded, so a pilot under fog resolves to the
   * arrow on the visible boundary line — never to a badge inside an
   * invisible node.
   */
  readonly drawnSystemIds: ReadonlySet<number>;
  readonly pilotSystemId: number;
  /** Sorted gate neighbours from the static asset; `[]` for unknown ids. */
  readonly neighbours: (id: number) => readonly number[];
}

/** The BFS bookkeeping one search reads and grows. */
interface PathScan {
  readonly seen: Set<number>;
  /** Each discovered system's inward predecessor, for path reconstruction. */
  readonly cameFrom: Map<number, number>;
}

/**
 * Expands the frontier by one jump; `found` is the pilot's system the moment
 * it is discovered.
 */
function expandPathFrontier(
  input: PilotPathInput,
  scan: PathScan,
  frontier: readonly number[],
): { readonly next: readonly number[]; readonly found: boolean } {
  const next: number[] = [];
  for (const systemId of frontier) {
    for (const neighbour of input.neighbours(systemId)) {
      if (scan.seen.has(neighbour)) continue;
      scan.seen.add(neighbour);
      scan.cameFrom.set(neighbour, systemId);
      if (neighbour === input.pilotSystemId) return { next, found: true };
      next.push(neighbour);
    }
  }
  return { next, found: false };
}

/** Walks `cameFrom` back from the pilot to the drawn boundary, inclusive. */
function reconstructPath(
  scan: PathScan,
  drawnSystemIds: ReadonlySet<number>,
  pilotSystemId: number,
): readonly number[] {
  const path = [pilotSystemId];
  // Every non-source discovery recorded its predecessor during expansion.
  let cursor = scan.cameFrom.get(pilotSystemId)!;
  while (!drawnSystemIds.has(cursor)) {
    path.push(cursor);
    cursor = scan.cameFrom.get(cursor)!;
  }
  path.push(cursor);
  return path.reverse();
}

/**
 * The shortest gate path from the nearest drawn system to the pilot,
 * inclusive of both ends, or `null` when no path exists within
 * `PILOT_PATH_MAX_JUMPS` (which covers unmapped J-space pilots by
 * construction — no gate adjacency reaches them). A pilot standing in a
 * drawn system returns the one-element path. Multi-source BFS outward from
 * the drawn boundary, sources and neighbours in ascending order.
 */
export function derivePilotPath(input: PilotPathInput): readonly number[] | null {
  if (input.drawnSystemIds.has(input.pilotSystemId)) return [input.pilotSystemId];
  if (input.drawnSystemIds.size === 0) return null;

  let frontier: readonly number[] = [...input.drawnSystemIds].sort((a, b) => a - b);
  const scan: PathScan = { seen: new Set(frontier), cameFrom: new Map() };

  for (let jumps = 1; jumps <= PILOT_PATH_MAX_JUMPS; jumps += 1) {
    const { next, found } = expandPathFrontier(input, scan, frontier);
    if (found) return reconstructPath(scan, input.drawnSystemIds, input.pilotSystemId);
    if (next.length === 0) return null;
    frontier = next;
  }
  return null;
}

/** One mounted arrow: which way it points along its host edge. */
export interface OutboundArrow {
  /** The path's outward endpoint on the host edge — the arrow aims at it. */
  readonly towardSystemId: number;
}

/** Inputs for one arrow-mount derivation pass. */
export interface OutboundArrowInput {
  /** Systems holding tracked pilots (any order; deduplicated here). */
  readonly pilotSystemIds: readonly number[];
  readonly drawnSystemIds: ReadonlySet<number>;
  readonly neighbours: (id: number) => readonly number[];
  /** Rendered-edge lookup by unordered endpoint pair; `null` when no edge is drawn. */
  readonly edgeIdOfPair: (a: number, b: number) => string | null;
}

/**
 * The outermost consecutive pair along one path that a rendered edge exists
 * for — the boundary line running into the fog — or `null` when the path
 * crosses no rendered edge at all.
 */
function mountFor(
  path: readonly number[],
  edgeIdOfPair: OutboundArrowInput['edgeIdOfPair'],
): { readonly edgeId: string; readonly towardSystemId: number } | null {
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const inward = path[index];
    const outward = path[index + 1];
    if (inward === undefined || outward === undefined) continue;
    const edgeId = edgeIdOfPair(inward, outward);
    if (edgeId !== null) return { edgeId, towardSystemId: outward };
  }
  return null;
}

/**
 * Resolves every off-map pilot to the rendered edge that carries their
 * outbound arrow. Pilots in drawn systems mount nothing (the frame badge
 * owns them); pilots with no bounded path, or whose path crosses no rendered
 * edge, mount nothing. One arrow per edge — the first resolving pilot
 * claims it.
 */
export function deriveOutboundArrows(
  input: OutboundArrowInput,
): ReadonlyMap<string, OutboundArrow> {
  const arrows = new Map<string, OutboundArrow>();
  const pilotSystems = [...new Set(input.pilotSystemIds)].sort((a, b) => a - b);
  for (const pilotSystemId of pilotSystems) {
    if (input.drawnSystemIds.has(pilotSystemId)) continue;
    const path = derivePilotPath({
      drawnSystemIds: input.drawnSystemIds,
      pilotSystemId,
      neighbours: input.neighbours,
    });
    if (path === null) continue;
    const mount = mountFor(path, input.edgeIdOfPair);
    if (mount === null || arrows.has(mount.edgeId)) continue;
    arrows.set(mount.edgeId, { towardSystemId: mount.towardSystemId });
  }
  return arrows;
}

/**
 * A pair lookup over the rendered edge list, for `deriveOutboundArrows`.
 * First edge between a pair wins, mirroring the canvas's pair-claiming order.
 */
export function edgeIdOfPairIndex(
  edges: readonly { readonly id: string; readonly source: string; readonly target: string }[],
): (a: number, b: number) => string | null {
  const byPair = new Map<string, string>();
  for (const edge of edges) {
    const a = Number(edge.source);
    const b = Number(edge.target);
    const key = a < b ? `${a}>${b}` : `${b}>${a}`;
    if (!byPair.has(key)) byPair.set(key, edge.id);
  }
  return (a, b) => byPair.get(a < b ? `${a}>${b}` : `${b}>${a}`) ?? null;
}
