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
import { pairKey } from '../lib/pair-key';

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
 * One bounded multi-source BFS outward from the drawn boundary, shared by
 * every target in a pass: a system's inward predecessor is fixed at first
 * discovery, expansion stops as soon as every target is labeled (or the jump
 * bound exhausts), and each target's path reconstructs from the same labels.
 * Sources and neighbours iterate in ascending order, so the labeling — and
 * every reconstructed path — is deterministic on every client.
 */
function scanTowardTargets(
  drawnSystemIds: ReadonlySet<number>,
  neighbours: (id: number) => readonly number[],
  targets: ReadonlySet<number>,
): PathScan {
  const remaining = new Set(targets);
  let frontier: readonly number[] = [...drawnSystemIds].sort((a, b) => a - b);
  const scan: PathScan = { seen: new Set(frontier), cameFrom: new Map() };
  for (let jumps = 1; jumps <= PILOT_PATH_MAX_JUMPS && remaining.size > 0; jumps += 1) {
    const next: number[] = [];
    for (const systemId of frontier) {
      for (const neighbour of neighbours(systemId)) {
        if (scan.seen.has(neighbour)) continue;
        scan.seen.add(neighbour);
        scan.cameFrom.set(neighbour, systemId);
        remaining.delete(neighbour);
        next.push(neighbour);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return scan;
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
    // Same invariant: every non-source cursor was discovered from a predecessor.
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

  const scan = scanTowardTargets(
    input.drawnSystemIds,
    input.neighbours,
    new Set([input.pilotSystemId]),
  );
  if (!scan.cameFrom.has(input.pilotSystemId)) return null;
  return reconstructPath(scan, input.drawnSystemIds, input.pilotSystemId);
}

/** One mounted arrow: which way it points along its host edge, and honestly whether anyone there is live. */
export interface OutboundArrow {
  /** The path's outward endpoint on the host edge — the arrow aims at it. */
  readonly towardSystemId: number;
  /**
   * True when any pilot the arrow stands for is feed-live; a stale-only
   * arrow tones muted so the one canvas signal an off-map pilot has cannot
   * overstate the feed (the badge/card staleness rule, applied here too).
   */
  readonly live: boolean;
}

/** One pilot-holding system, as the arrow derivation consumes it. */
export interface ArrowPilotSystem {
  readonly systemId: number;
  /** True when any pilot standing there is feed-live. */
  readonly live: boolean;
}

/** Inputs for one arrow-mount derivation pass. */
export interface OutboundArrowInput {
  /** Systems holding tracked pilots (any order; deduplicated here). */
  readonly pilotSystems: readonly ArrowPilotSystem[];
  readonly drawnSystemIds: ReadonlySet<number>;
  readonly neighbours: (id: number) => readonly number[];
  /** Rendered-edge lookup by unordered endpoint pair; `null` when no edge is drawn. */
  readonly edgeIdOfPair: (a: number, b: number) => string | null;
}

/** Deduplicates off-map pilot systems while keeping any live claimant live. */
function offMapPilotLiveness(
  pilotSystems: readonly ArrowPilotSystem[],
  drawnSystemIds: ReadonlySet<number>,
): Map<number, boolean> {
  const offMapLive = new Map<number, boolean>();
  for (const pilot of pilotSystems) {
    if (drawnSystemIds.has(pilot.systemId)) continue;
    offMapLive.set(pilot.systemId, (offMapLive.get(pilot.systemId) ?? false) || pilot.live);
  }
  return offMapLive;
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
 * outbound arrow, from ONE shared boundary scan — the expansion is
 * pilot-independent, so several off-map pilots (reachable or not) cost a
 * single bounded BFS per pass. Pilots in drawn systems mount nothing (the
 * frame badge owns them); pilots with no bounded path, or whose path crosses
 * no rendered edge, mount nothing. One arrow per edge — the first resolving
 * pilot claims its direction, and any live claimant keeps it live.
 */
export function deriveOutboundArrows(
  input: OutboundArrowInput,
): ReadonlyMap<string, OutboundArrow> {
  const offMapLive = offMapPilotLiveness(input.pilotSystems, input.drawnSystemIds);
  const arrows = new Map<string, OutboundArrow>();
  if (offMapLive.size === 0 || input.drawnSystemIds.size === 0) return arrows;

  const scan = scanTowardTargets(
    input.drawnSystemIds,
    input.neighbours,
    new Set(offMapLive.keys()),
  );
  const pilotSystems = [...offMapLive.keys()].sort((a, b) => a - b);
  for (const pilotSystemId of pilotSystems) {
    if (!scan.cameFrom.has(pilotSystemId)) continue;
    const path = reconstructPath(scan, input.drawnSystemIds, pilotSystemId);
    const mount = mountFor(path, input.edgeIdOfPair);
    if (mount === null) continue;
    // The system is off-map, so its liveness entry exists by construction.
    const live = offMapLive.get(pilotSystemId)!;
    const existing = arrows.get(mount.edgeId);
    if (existing === undefined) {
      arrows.set(mount.edgeId, { towardSystemId: mount.towardSystemId, live });
    } else if (live && !existing.live) {
      arrows.set(mount.edgeId, { towardSystemId: existing.towardSystemId, live: true });
    }
  }
  return arrows;
}

/**
 * Serializes a pilot-system summary as a content key: the provider's
 * staleness tick rebuilds the presence map's identity every pass, but arrows
 * depend only on membership + liveness, so the derivation memoizes on this
 * string and re-runs the scan only when that content actually changes.
 */
export function arrowPilotKey(pilotSystems: readonly ArrowPilotSystem[]): string {
  return pilotSystems
    .map((pilot) => `${pilot.systemId}:${pilot.live ? 1 : 0}`)
    .join(',');
}

/** Parses an `arrowPilotKey` back into its summary; inverse of the serializer. */
export function parseArrowPilotKey(key: string): readonly ArrowPilotSystem[] {
  if (key === '') return [];
  return key.split(',').map((part) => {
    const [systemId, live] = part.split(':');
    return { systemId: Number(systemId), live: live === '1' };
  });
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
    const key = pairKey(Number(edge.source), Number(edge.target));
    if (!byPair.has(key)) byPair.set(key, edge.id);
  }
  return (a, b) => byPair.get(pairKey(a, b)) ?? null;
}
