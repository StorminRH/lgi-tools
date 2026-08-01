// The reconciler's output vocabulary — the interface sub-version 4.0.3.2's motion work consumes.
//
// CONTRACT (session 4.0.2.3.1, decision PD-1): these five kinds are frozen here even though no
// motion ships in this session, because 4.0.3.2 binds surfacing, exit, and glide animations to them.
// The kinds are deliberately renderer-neutral nouns describing what happened to the CHAIN, not to
// the canvas: reusing React Flow's `NodeChange` objects would weld the motion contract to a renderer
// library the motion session does not own.
//
// Consumers should treat the union as exhaustive and switch on `kind`.

/**
 * A position in the canvas coordinate space.
 *
 * Intentionally not React Flow's `XYPosition`: positions cross the motion boundary, and the intent
 * vocabulary stays free of renderer types (PD-1).
 */
export interface ChainPosition {
  readonly x: number;
  readonly y: number;
}

/** A system became visible on the map, parked at its first assigned position. */
interface SystemAppeared {
  readonly kind: 'system-appeared';
  readonly systemId: number;
  readonly position: ChainPosition;
}

/** A system left the map. Emitted only from a complete snapshot, never from a draining page. */
interface SystemDeparted {
  readonly kind: 'system-departed';
  readonly systemId: number;
}

/**
 * An existing, unprotected system was repositioned because the placement seam proposed a new
 * position.
 *
 * This session's grid assigner never proposes one in production — it returns an already-placed
 * node's current position unchanged — so this kind exists for 4.0.3.1's deterministic layout engine
 * and is proven now by driving the seam directly in tests. An incoming server change alone can never
 * produce it (contract HC-1).
 */
interface SystemMoved {
  readonly kind: 'system-moved';
  readonly systemId: number;
  readonly from: ChainPosition;
  readonly to: ChainPosition;
}

/**
 * A connection became visible, meaning both of its endpoint systems are on the map.
 *
 * Visibility, not document existence: a connection whose endpoint has not arrived yet is withheld
 * silently and emits this only once that endpoint appears.
 */
interface ConnectionAppeared {
  readonly kind: 'connection-appeared';
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number;
}

/**
 * A connection stopped being visible — either its document left a complete snapshot, or one of its
 * endpoint systems departed while the document itself persists server-side.
 */
interface ConnectionDeparted {
  readonly kind: 'connection-departed';
  readonly connectionId: string;
}

/**
 * Everything the reconciler can say about one merge. Exhaustive: switch on `kind`.
 *
 * The union is the public surface; its five members are deliberately NOT exported, because no caller
 * needs one in isolation today. A consumer that later wants a single kind narrows the union rather
 * than importing a variant — `Extract<MapChainIntent, { kind: 'system-moved' }>` — which keeps the
 * vocabulary frozen (PD-1) without publishing five types nothing names.
 */
export type MapChainIntent =
  | SystemAppeared
  | SystemDeparted
  | SystemMoved
  | ConnectionAppeared
  | ConnectionDeparted;

/** Every intent kind, for exhaustiveness checks and test coverage assertions. */
export const MAP_CHAIN_INTENT_KINDS = [
  'system-appeared',
  'system-departed',
  'system-moved',
  'connection-appeared',
  'connection-departed',
] as const satisfies readonly MapChainIntent['kind'][];

/** True when two positions are the same point; the no-op test that suppresses a `system-moved`. */
export function samePosition(a: ChainPosition, b: ChainPosition): boolean {
  return a.x === b.x && a.y === b.y;
}
