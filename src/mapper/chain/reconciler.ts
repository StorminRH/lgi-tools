// The merge owner: previous state plus fresh snapshots in, next state plus named intents out.
//
// This module is PURE and is the only producer of canvas nodes and edges (contract DC-7). The canvas
// consumes its intents and its state; it never reads Convex pages directly.
//
// Contract HC-1 — the version's central bet — is enforced structurally here rather than by review:
//   1. An incoming server change alone never repositions anything. Positions come only from the
//      placement seam, and this session's grid assigner returns an already-placed node's current
//      position unchanged.
//   2. A protected node is never repositioned by anyone. Protection is the union of the caller's
//      active-drag set AND every node whose placement source is `user`; the second half is derived
//      from state here, so a caller that forgets to include a user-placed node still cannot move it.
//   3. An existing node's position changes only when the assigner explicitly proposes a different
//      one, and that is exactly when `system-moved` is emitted.
//
// Departure safety is also structural, not conditional. When a collection's snapshot is incomplete
// (pagination still draining), that collection is merged ADDITIVELY with what was already known, so
// nothing can disappear from it. A plain set difference is therefore only ever able to report a
// departure that a complete snapshot justifies — there is no "if complete" branch to get wrong.
import {
  samePosition,
  type ChainPosition,
  type MapChainIntent,
} from './intents';
import { OPTIMISTIC_ID_PREFIX } from './optimistic-authoring';
import type { PlacementAssigner, PlacementCandidate } from './placement';

/** Where a node's current position came from. `user` positions are permanently protected. */
export type PlacementSource = 'assigner' | 'user';

/** One placed system in reconciled state. */
export interface PlacedSystem {
  readonly systemId: number;
  readonly position: ChainPosition;
  readonly placementSource: PlacementSource;
}

/** One connection whose endpoints are both on the map, so it can be drawn. */
export interface VisibleConnection {
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly deletedAt?: number | null;
  readonly purgeAfter?: number | null;
}

/** The reconciled picture the canvas renders. Insertion order is arrival order. */
export interface ChainState {
  readonly systems: ReadonlyMap<number, PlacedSystem>;
  readonly connections: ReadonlyMap<string, VisibleConnection>;
}

/** One row of the systems subscription. */
export interface SystemRow {
  readonly systemId: number;
}

/** One row of the connections subscription. */
export interface ConnectionRow {
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly deletedAt?: number | null;
  readonly purgeAfter?: number | null;
}

/**
 * One collection's current rows plus whether every page has landed.
 *
 * `complete` is the honesty flag that makes departures safe: an incomplete collection is merged
 * additively, so a still-draining page can never be read as a removal.
 */
export interface SnapshotCollection<Row> {
  readonly rows: readonly Row[];
  readonly complete: boolean;
}

/** Both live collections as of one merge. */
export interface ChainSnapshot {
  readonly systems: SnapshotCollection<SystemRow>;
  readonly connections: SnapshotCollection<ConnectionRow>;
}

/** The result of one merge. */
export interface ChainMerge {
  readonly state: ChainState;
  readonly intents: readonly MapChainIntent[];
}

/** The starting point before any page has landed: an empty map, not a loading state (HC-5). */
export const EMPTY_CHAIN_STATE: ChainState = {
  systems: new Map(),
  connections: new Map(),
};

const ORIGIN: ChainPosition = { x: 0, y: 0 };

/**
 * Present system IDs, in stable arrival order.
 *
 * Previously-known systems keep their original order so the grid stays stable across merges; genuinely
 * new ones follow in snapshot order. An incomplete snapshot is additive, so nothing departs from it.
 */
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

/** Known connection documents, additively merged while the collection is still draining. */
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

/** Every node the user owns the position of, which no assigner may move (HC-1). */
function userPlacedIds(previous: ChainState): Set<number> {
  const owned = new Set<number>();
  for (const [systemId, placed] of previous.systems) {
    if (placed.placementSource === 'user') owned.add(systemId);
  }
  return owned;
}

/** Applies the assigner's proposals, emitting an intent for each first appearance and reposition. */
function placeSystems(
  previous: ChainState,
  present: readonly number[],
  isProtected: (systemId: number) => boolean,
  proposals: ReadonlyMap<number, ChainPosition>,
): { systems: Map<number, PlacedSystem>; appeared: MapChainIntent[]; moved: MapChainIntent[] } {
  const systems = new Map<number, PlacedSystem>();
  const appeared: MapChainIntent[] = [];
  const moved: MapChainIntent[] = [];

  for (const systemId of present) {
    const existing = previous.systems.get(systemId);

    if (existing === undefined) {
      // A first appearance must land somewhere; an assigner that declines to place it gets the
      // origin rather than being dropped from the map.
      const position = proposals.get(systemId) ?? ORIGIN;
      systems.set(systemId, { systemId, position, placementSource: 'assigner' });
      appeared.push({ kind: 'system-appeared', systemId, position });
      continue;
    }

    const proposed = proposals.get(systemId) ?? existing.position;
    if (isProtected(systemId) || samePosition(proposed, existing.position)) {
      systems.set(systemId, existing);
      continue;
    }

    systems.set(systemId, { ...existing, position: proposed });
    moved.push({
      kind: 'system-moved',
      systemId,
      from: existing.position,
      to: proposed,
    });
  }

  return { systems, appeared, moved };
}

/** Connections whose two endpoints are both present, keyed in known-document order. */
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

/**
 * Merges one pair of snapshots into the next reconciled state and the intents describing the change.
 *
 * The assigner is consulted on every merge for every unprotected node, new or existing (PD-3), which
 * is what keeps 4.0.3.1's repositioning path real instead of unreachable. `protectedIds` is the
 * caller's active-drag set; user-placed nodes are added to it here.
 *
 * Intents are emitted in a fixed order — departures, then arrivals, then repositions — so a consumer
 * binding exit animations before entry animations sees a stable sequence.
 */
export function reconcileChain(
  previous: ChainState,
  snapshot: ChainSnapshot,
  protectedIds: ReadonlySet<number>,
  assigner: PlacementAssigner,
): ChainMerge {
  const present = resolvePresentSystems(previous, snapshot);
  const presentSet = new Set(present);
  const known = resolveKnownConnections(previous, snapshot);
  const visible = resolveVisibleConnections(known, presentSet);

  const owned = userPlacedIds(previous);
  const isProtected = (systemId: number) =>
    protectedIds.has(systemId) || owned.has(systemId);

  const candidates: PlacementCandidate[] = present.map((systemId) => ({
    systemId,
    position: previous.systems.get(systemId)?.position ?? null,
    locked: isProtected(systemId),
  }));
  const proposals = assigner({
    systems: candidates,
    connections: [...visible.values()],
  });

  const { systems, appeared, moved } = placeSystems(
    previous,
    present,
    isProtected,
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

  // Same-merge endpoint-matched id-swap: an optimistic temp-id departing
  // together with a confirmed id appearing on the same endpoints is one edge
  // identity update, not a birth/death pair (session 4.0.4.1.1 PD-1).
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

/** Exact directed endpoint key — parallel same-endpoint edges share it. */
function endpointKey(fromSystemId: number, toSystemId: number): string {
  return `${fromSystemId}>${toSystemId}`;
}

/**
 * Drops matched `connection-departed` / `connection-appeared` pairs only when
 * the departing id is an optimistic temp id. A real same-endpoint replacement
 * remains a genuine birth/death pair.
 */
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

/**
 * Stamps a node's position as user-owned, permanently protecting it from the assigner (PD-2).
 *
 * Called at drag stop. Kept here rather than in the canvas so every write to reconciled state has
 * one owner, and unknown systems are ignored so a stale drag callback cannot invent a node.
 */
export function applyUserPlacement(
  state: ChainState,
  systemId: number,
  position: ChainPosition,
): ChainState {
  const existing = state.systems.get(systemId);
  if (existing === undefined) return state;

  const systems = new Map(state.systems);
  systems.set(systemId, { systemId, position, placementSource: 'user' });
  return { systems, connections: state.connections };
}

/**
 * Reverts every user-owned placement to assigner ownership, positions untouched (re-lock).
 *
 * The next layout merge then applies kernel proposals and emits ordinary `system-moved`
 * intents — the node snaps home without a special-case movement path, and shared layout
 * never changed because the kernel never saw the pin.
 */
export function clearUserPlacements(state: ChainState): ChainState {
  let changed = false;
  const systems = new Map<number, PlacedSystem>();
  for (const [systemId, placed] of state.systems) {
    if (placed.placementSource === 'user') {
      systems.set(systemId, { ...placed, placementSource: 'assigner' });
      changed = true;
    } else {
      systems.set(systemId, placed);
    }
  }
  if (!changed) return state;
  return { systems, connections: state.connections };
}
