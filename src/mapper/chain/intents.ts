export interface ChainPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Everything the reconciler can say about one merge. Exhaustive: switch on `kind`.
 *
 * The union is the public surface. A consumer that wants one kind narrows it
 * with `Extract<MapChainIntent, { kind: 'system-moved' }>`, so the vocabulary
 * stays frozen (PD-1) without five named variants.
 *
 * `system-appeared`: became visible, parked at its first assigned position.
 * `system-departed`: left the map. Emitted only from a complete snapshot, never
 * from a draining page.
 * `system-moved`: an unprotected system was repositioned because the placement
 * seam proposed a new position. This session's grid assigner never proposes one
 * in production. It returns an already-placed node's current position unchanged,
 * so this kind exists for 4.0.3.1's deterministic layout engine and is proven
 * now by driving the seam directly in tests. An incoming server change alone can
 * never produce it (contract HC-1).
 * `connection-appeared`: both endpoint systems are on the map. Visibility, not
 * document existence: a connection whose endpoint has not arrived yet is
 * withheld silently and emits this only once that endpoint appears.
 * `connection-departed`: either its document left a complete snapshot, or one of
 * its endpoint systems departed while the document itself persists server-side.
 */
export type MapChainIntent =
  | {
      readonly kind: 'system-appeared';
      readonly systemId: number;
      readonly position: ChainPosition;
    }
  | {
      readonly kind: 'system-departed';
      readonly systemId: number;
    }
  | {
      readonly kind: 'system-moved';
      readonly systemId: number;
      readonly from: ChainPosition;
      readonly to: ChainPosition;
    }
  | {
      readonly kind: 'connection-appeared';
      readonly connectionId: string;
      readonly fromSystemId: number;
      readonly toSystemId: number;
    }
  | {
      readonly kind: 'connection-departed';
      readonly connectionId: string;
    };

/** True when two positions are the same point; the no-op test that suppresses a `system-moved`. */
export function samePosition(a: ChainPosition, b: ChainPosition): boolean {
  return a.x === b.x && a.y === b.y;
}
