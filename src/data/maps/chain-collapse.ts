/** Pilot knowledge supplied to the collapse core by the active trigger. */
export type PilotsPresent = 'present' | 'absent' | 'unknown';

/** One live system fact required by the pure collapse decision. */
export interface CollapseSystem {
  readonly id: number;
  readonly isRoot?: boolean;
}

/** One live connection fact required by the pure collapse decision. */
export interface CollapseConnection {
  readonly id: string;
  readonly fromSystemId: number;
  readonly toSystemId: number;
}

/** Inputs shared by manual severing and the later automatic collapse triggers. */
export interface CollapseDecisionInput {
  readonly cutConnectionId: string;
  readonly systems: readonly CollapseSystem[];
  readonly connections: readonly CollapseConnection[];
  readonly pilotsPresent: PilotsPresent;
}

/** The computed keep/remove result enforced by the server mutation. */
export type CollapseDecision =
  | { readonly kind: 'retain' }
  | {
      readonly kind: 'remove';
      readonly systemIds: readonly number[];
      readonly connectionIds: readonly string[];
    };

/** Collects the connected component containing one endpoint after the cut. */
function componentFrom(
  start: number,
  adjacency: ReadonlyMap<number, readonly number[]>,
): Set<number> {
  const component = new Set<number>();
  const pending = [start];
  while (pending.length > 0) {
    const systemId = pending.pop();
    if (systemId === undefined || component.has(systemId)) continue;
    component.add(systemId);
    pending.push(...(adjacency.get(systemId) ?? []));
  }
  return component;
}

/**
 * Computes the one collapse outcome for a cut edge. Only the cut endpoints'
 * components participate, so severing inside a retained island never
 * re-examines unrelated islands. A component is retained when it still holds
 * the map root or present pilots — a k-space system alone is not a keep
 * reason.
 */
export function decideCollapse(input: CollapseDecisionInput): CollapseDecision {
  const cut = input.connections.find(
    (connection) => connection.id === input.cutConnectionId,
  );
  if (cut === undefined || cut.fromSystemId === cut.toSystemId) {
    return { kind: 'retain' };
  }

  const adjacency = new Map<number, number[]>();
  const append = (from: number, to: number) => {
    const neighbours = adjacency.get(from) ?? [];
    neighbours.push(to);
    adjacency.set(from, neighbours);
  };
  for (const connection of input.connections) {
    if (connection.id === input.cutConnectionId) continue;
    append(connection.fromSystemId, connection.toSystemId);
    append(connection.toSystemId, connection.fromSystemId);
  }

  const components = [
    componentFrom(cut.fromSystemId, adjacency),
    componentFrom(cut.toSystemId, adjacency),
  ];
  if (components[0]?.has(cut.toSystemId)) return { kind: 'retain' };

  const rootIds = new Set(
    input.systems.filter((system) => system.isRoot === true).map((system) => system.id),
  );
  const removeSystemIds = new Set<number>();
  for (const component of components) {
    const retained =
      [...component].some((systemId) => rootIds.has(systemId))
      || input.pilotsPresent === 'present';
    if (!retained) {
      for (const systemId of component) removeSystemIds.add(systemId);
    }
  }

  if (removeSystemIds.size === 0) return { kind: 'retain' };
  const systemIds = [...removeSystemIds].sort((left, right) => left - right);
  const connectionIds = input.connections
    .filter(
      (connection) =>
        removeSystemIds.has(connection.fromSystemId) ||
        removeSystemIds.has(connection.toSystemId),
    )
    .map((connection) => connection.id)
    .sort();
  return { kind: 'remove', systemIds, connectionIds };
}
