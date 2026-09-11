export const TRADE_HUBS = [
  { id: 30_000_142, name: 'Jita' },
  { id: 30_002_187, name: 'Amarr' },
  { id: 30_002_659, name: 'Dodixie' },
  { id: 30_002_510, name: 'Rens' },
  { id: 30_002_053, name: 'Hek' },
] as const;

export interface HubJump {
  readonly id: (typeof TRADE_HUBS)[number]['id'];
  readonly name: (typeof TRADE_HUBS)[number]['name'];
  readonly jumps: number | null;
}

export type HubJumpTuple = readonly [
  HubJump,
  HubJump,
  HubJump,
  HubJump,
  HubJump,
];

const HUB_ORDER = new Map(
  TRADE_HUBS.map((hub, index) => [hub.id, index]),
);

function compareHubJumps(left: HubJump, right: HubJump): number {
  if (left.jumps === null && right.jumps === null) {
    return (HUB_ORDER.get(left.id) ?? 0) - (HUB_ORDER.get(right.id) ?? 0);
  }
  if (left.jumps === null) return 1;
  if (right.jumps === null) return -1;
  if (left.jumps !== right.jumps) return left.jumps - right.jumps;
  return (HUB_ORDER.get(left.id) ?? 0) - (HUB_ORDER.get(right.id) ?? 0);
}

function distancesFrom(
  origin: number,
  neighbours: (id: number) => readonly number[],
): ReadonlyMap<number, number> {
  const distances = new Map<number, number>([[origin, 0]]);
  const queue = [origin];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === undefined) continue;
    const jumps = distances.get(current);
    if (jumps === undefined) continue;
    for (const next of neighbours(current)) {
      if (distances.has(next)) continue;
      distances.set(next, jumps + 1);
      queue.push(next);
    }
  }
  return distances;
}

function tupleFromJumps(
  jumpsByHub: ReadonlyMap<number, number | null>,
): HubJumpTuple {
  const rows = TRADE_HUBS.map((hub) => ({
    id: hub.id,
    name: hub.name,
    jumps: jumpsByHub.get(hub.id) ?? null,
  })).sort(compareHubJumps);
  return [rows[0]!, rows[1]!, rows[2]!, rows[3]!, rows[4]!];
}

export function buildHubJumpIndex(
  neighbours: (id: number) => readonly number[],
): (systemId: number) => HubJumpTuple {
  const distanceByHub = TRADE_HUBS.map((hub) => ({
    id: hub.id,
    distances: distancesFrom(hub.id, neighbours),
  }));
  return (systemId) =>
    tupleFromJumps(
      new Map(
        distanceByHub.map((hub) => [hub.id, hub.distances.get(systemId) ?? null]),
      ),
    );
}

export function hubJumpsFrom(
  systemId: number,
  neighbours: (id: number) => readonly number[],
): HubJumpTuple {
  return buildHubJumpIndex(neighbours)(systemId);
}

export function formatHubJump(hub: HubJump): string {
  return hub.jumps === null ? `${hub.name} —` : `${hub.name} ${hub.jumps}`;
}

export function closestHubLabel(hubs: HubJumpTuple): string | null {
  const closest = hubs[0];
  if (closest.jumps === null) return null;
  return `${closest.name} ${closest.jumps}`;
}
