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

function hubKey(hubId: number, systemId: number): string {
  return `${hubId}:${systemId}`;
}

function compareHubJumps(left: HubJump, right: HubJump): number {
  if (left.jumps === null && right.jumps === null) {
    return (HUB_ORDER.get(left.id) ?? 0) - (HUB_ORDER.get(right.id) ?? 0);
  }
  if (left.jumps === null) return 1;
  if (right.jumps === null) return -1;
  if (left.jumps !== right.jumps) return left.jumps - right.jumps;
  return (HUB_ORDER.get(left.id) ?? 0) - (HUB_ORDER.get(right.id) ?? 0);
}

export function hubJumpsFrom(
  systemId: number,
  neighbours: (id: number) => readonly number[],
): HubJumpTuple {
  const jumpsByHub = new Map<number, number | null>(
    TRADE_HUBS.map((hub) => [hub.id, null]),
  );
  const queue: { systemId: number; hubId: number; jumps: number }[] = [];
  const seen = new Set<string>();
  for (const hub of TRADE_HUBS) {
    queue.push({ systemId: hub.id, hubId: hub.id, jumps: 0 });
    seen.add(hubKey(hub.id, hub.id));
  }

  let remaining = TRADE_HUBS.length;
  for (let index = 0; index < queue.length && remaining > 0; index += 1) {
    const current = queue[index];
    if (current === undefined) continue;
    if (current.systemId === systemId) {
      jumpsByHub.set(current.hubId, current.jumps);
      remaining -= 1;
      continue;
    }
    for (const next of neighbours(current.systemId)) {
      const key = hubKey(current.hubId, next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({
        systemId: next,
        hubId: current.hubId,
        jumps: current.jumps + 1,
      });
    }
  }

  const rows = TRADE_HUBS.map((hub) => ({
    id: hub.id,
    name: hub.name,
    jumps: jumpsByHub.get(hub.id) ?? null,
  })).sort(compareHubJumps);

  return [rows[0]!, rows[1]!, rows[2]!, rows[3]!, rows[4]!];
}
