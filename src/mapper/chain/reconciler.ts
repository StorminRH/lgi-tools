import {
  samePosition,
  type ChainPosition,
  type MapChainIntent,
} from './intents';
import { OPTIMISTIC_ID_PREFIX } from './optimistic-authoring';
import type { PlacementAssigner, PlacementCandidate } from './placement';

export interface PlacedSystem {
  readonly systemId: number;
  readonly position: ChainPosition;
}

export interface VisibleConnection {
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly deletedAt?: number | null;
  readonly purgeAfter?: number | null;
}

export interface ChainState {
  readonly systems: ReadonlyMap<number, PlacedSystem>;
  readonly connections: ReadonlyMap<string, VisibleConnection>;
}

export interface SystemRow {
  readonly systemId: number;
}

export interface ConnectionRow {
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly deletedAt?: number | null;
  readonly purgeAfter?: number | null;
}

export interface SnapshotCollection<Row> {
  readonly rows: readonly Row[];
  readonly complete: boolean;
}

export interface ChainSnapshot {
  readonly systems: SnapshotCollection<SystemRow>;
  readonly connections: SnapshotCollection<ConnectionRow>;
}

export interface ChainMerge {
  readonly state: ChainState;
  readonly intents: readonly MapChainIntent[];
}

export const EMPTY_CHAIN_STATE: ChainState = {
  systems: new Map(),
  connections: new Map(),
};

const ORIGIN: ChainPosition = { x: 0, y: 0 };

function resolvePresentSystems(
  previous: ChainState,
  snapshot: ChainSnapshot,
): number[] {
  const incoming = new Set(snapshot.systems.rows.map((row) => row.systemId));
  const retained = [...previous.systems.keys()].filter(
    (systemId) => incoming.has(systemId) || !snapshot.systems.complete,
  );
  const retainedSet = new Set(retained);
  const arrived = snapshot.systems.rows
    .map((row) => row.systemId)
    .filter((systemId) => !retainedSet.has(systemId));
  return [...retained, ...arrived];
}

function resolveKnownConnections(
  previous: ChainState,
  snapshot: ChainSnapshot,
): Map<string, ConnectionRow> {
  const known = new Map<string, ConnectionRow>();
  if (!snapshot.connections.complete) {
    for (const [connectionId, connection] of previous.connections) {
      known.set(connectionId, connection);
    }
  }
  for (const row of snapshot.connections.rows) {
    known.set(row.connectionId, row);
  }
  return known;
}

function placeSystems(
  previous: ChainState,
  present: readonly number[],
  proposals: ReadonlyMap<number, ChainPosition>,
): { systems: Map<number, PlacedSystem>; appeared: MapChainIntent[]; moved: MapChainIntent[] } {
  const systems = new Map<number, PlacedSystem>();
  const appeared: MapChainIntent[] = [];
  const moved: MapChainIntent[] = [];

  for (const systemId of present) {
    const existing = previous.systems.get(systemId);

    if (existing === undefined) {
      const position = proposals.get(systemId) ?? ORIGIN;
      systems.set(systemId, { systemId, position });
      appeared.push({ kind: 'system-appeared', systemId, position });
      continue;
    }

    const proposed = proposals.get(systemId) ?? existing.position;
    if (samePosition(proposed, existing.position)) {
      systems.set(systemId, existing);
      continue;
    }

    systems.set(systemId, { systemId, position: proposed });
    moved.push({
      kind: 'system-moved',
      systemId,
      from: existing.position,
      to: proposed,
    });
  }

  return { systems, appeared, moved };
}

function resolveVisibleConnections(
  known: ReadonlyMap<string, ConnectionRow>,
  present: ReadonlySet<number>,
): Map<string, VisibleConnection> {
  const visible = new Map<string, VisibleConnection>();
  for (const [connectionId, row] of known) {
    if (present.has(row.fromSystemId) && present.has(row.toSystemId)) {
      visible.set(connectionId, row);
    }
  }
  return visible;
}

export function reconcileChain(
  previous: ChainState,
  snapshot: ChainSnapshot,
  assigner: PlacementAssigner,
): ChainMerge {
  const present = resolvePresentSystems(previous, snapshot);
  const presentSet = new Set(present);
  const known = resolveKnownConnections(previous, snapshot);
  const visible = resolveVisibleConnections(known, presentSet);

  const candidates: PlacementCandidate[] = present.map((systemId) => ({
    systemId,
    position: previous.systems.get(systemId)?.position ?? null,
  }));
  const proposals = assigner({
    systems: candidates,
    connections: [...visible.values()],
  });

  const { systems, appeared, moved } = placeSystems(
    previous,
    present,
    proposals,
  );

  const departedSystems: MapChainIntent[] = [...previous.systems.keys()]
    .filter((systemId) => !presentSet.has(systemId))
    .map((systemId) => ({ kind: 'system-departed', systemId }));

  const rawDepartedConnections: MapChainIntent[] = [...previous.connections.keys()]
    .filter((connectionId) => !visible.has(connectionId))
    .map((connectionId) => ({ kind: 'connection-departed', connectionId }));

  const rawAppearedConnections: MapChainIntent[] = [...visible.values()]
    .filter((connection) => !previous.connections.has(connection.connectionId))
    .map(({ connectionId, fromSystemId, toSystemId }) => ({
      kind: 'connection-appeared',
      connectionId,
      fromSystemId,
      toSystemId,
    }));

  const { departedConnections, appearedConnections } = suppressConnectionIdSwaps(
    previous.connections,
    rawDepartedConnections,
    rawAppearedConnections,
  );

  return {
    state: { systems, connections: visible },
    intents: [
      ...departedSystems,
      ...departedConnections,
      ...appeared,
      ...appearedConnections,
      ...moved,
    ],
  };
}

function endpointKey(fromSystemId: number, toSystemId: number): string {
  return `${fromSystemId}>${toSystemId}`;
}

function suppressConnectionIdSwaps(
  previousConnections: ReadonlyMap<string, VisibleConnection>,
  departed: readonly MapChainIntent[],
  appeared: readonly MapChainIntent[],
): {
  departedConnections: MapChainIntent[];
  appearedConnections: MapChainIntent[];
} {
  const departedIds = new Set(
    departed.flatMap((intent) =>
      intent.kind === 'connection-departed' ? [intent.connectionId] : [],
    ),
  );
  const unmatchedDepartedByEndpoint = new Map<string, string[]>();
  for (const connectionId of departedIds) {
    if (!connectionId.startsWith(OPTIMISTIC_ID_PREFIX)) continue;
    const prior = previousConnections.get(connectionId);
    if (prior === undefined) continue;
    const key = endpointKey(prior.fromSystemId, prior.toSystemId);
    const queue = unmatchedDepartedByEndpoint.get(key);
    if (queue === undefined) unmatchedDepartedByEndpoint.set(key, [connectionId]);
    else queue.push(connectionId);
  }

  const matchedDeparted = new Set<string>();
  const matchedAppeared = new Set<string>();
  for (const intent of appeared) {
    if (intent.kind !== 'connection-appeared') continue;
    const key = endpointKey(intent.fromSystemId, intent.toSystemId);
    const queue = unmatchedDepartedByEndpoint.get(key);
    const priorId = queue?.shift();
    if (priorId === undefined) continue;
    matchedDeparted.add(priorId);
    matchedAppeared.add(intent.connectionId);
  }

  return {
    departedConnections: departed.filter(
      (intent) =>
        intent.kind !== 'connection-departed' ||
        !matchedDeparted.has(intent.connectionId),
    ),
    appearedConnections: appeared.filter(
      (intent) =>
        intent.kind !== 'connection-appeared' ||
        !matchedAppeared.has(intent.connectionId),
    ),
  };
}

