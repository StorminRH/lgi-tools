import { pairKey } from '../lib/pair-key';

export const PILOT_PATH_MAX_JUMPS = 15;

export interface PilotPathInput {

  readonly drawnSystemIds: ReadonlySet<number>;
  readonly pilotSystemId: number;

  readonly neighbours: (id: number) => readonly number[];
}

interface PathScan {
  readonly seen: Set<number>;

  readonly cameFrom: Map<number, number>;
}

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

function reconstructPath(
  scan: PathScan,
  drawnSystemIds: ReadonlySet<number>,
  pilotSystemId: number,
): readonly number[] {
  const path = [pilotSystemId];

  let cursor = scan.cameFrom.get(pilotSystemId)!;
  while (!drawnSystemIds.has(cursor)) {
    path.push(cursor);

    cursor = scan.cameFrom.get(cursor)!;
  }
  path.push(cursor);
  return path.reverse();
}

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

export interface OutboundArrow {

  readonly towardSystemId: number;

  readonly live: boolean;
}

export interface ArrowPilotSystem {
  readonly systemId: number;

  readonly live: boolean;
}

export interface OutboundArrowInput {

  readonly pilotSystems: readonly ArrowPilotSystem[];
  readonly drawnSystemIds: ReadonlySet<number>;
  readonly neighbours: (id: number) => readonly number[];

  readonly edgeIdOfPair: (a: number, b: number) => string | null;
}

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

export function arrowPilotKey(pilotSystems: readonly ArrowPilotSystem[]): string {
  return pilotSystems
    .map((pilot) => `${pilot.systemId}:${pilot.live ? 1 : 0}`)
    .join(',');
}

export function parseArrowPilotKey(key: string): readonly ArrowPilotSystem[] {
  if (key === '') return [];
  return key.split(',').map((part) => {
    const [systemId, live] = part.split(':');
    return { systemId: Number(systemId), live: live === '1' };
  });
}

export function edgeIdOfPairIndex(
  edges: readonly { readonly id: string; readonly source: string; readonly target: string }[],
): (a: number, b: number) => string | null {
  const byPair = new Map<string, string>();
  for (const edge of edges) {
    const source = Number(edge.source);
    const target = Number(edge.target);

    if (!Number.isFinite(source) || !Number.isFinite(target)) continue;
    const key = pairKey(source, target);
    if (!byPair.has(key)) byPair.set(key, edge.id);
  }
  return (a, b) => byPair.get(pairKey(a, b)) ?? null;
}
