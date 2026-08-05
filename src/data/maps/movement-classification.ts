/** Every movement outcome consumed by the map-side jump workflow. */
export type MovementVerdict =
  | 'stationary'
  | 'same-system-state'
  | 'gate-placement'
  | 'hole-crossing'
  | 're-anchor';

/** Consecutive location facts needed to classify one observed transition. */
export interface MovementFacts {
  readonly fromSolarSystemId: number | null;
  readonly toSolarSystemId: number;
  readonly prevFresh: boolean;
  readonly shipBecameCapsule: boolean;
  readonly sameSystemStateChange: boolean;
}

/** Injected SDE geography used without coupling the classifier to an asset loader. */
export interface MovementGeography {
  readonly gateLinked: (fromSolarSystemId: number, toSolarSystemId: number) => boolean;
  readonly isWormholeSpace: (solarSystemId: number) => boolean;
}

/**
 * Classifies one location transition without retaining history or performing I/O.
 * Discontinuous samples re-anchor before any topology decision is trusted.
 */
export function classifyMovement(
  facts: MovementFacts,
  geography: MovementGeography,
): MovementVerdict {
  if (facts.fromSolarSystemId === null || !facts.prevFresh) {
    return 're-anchor';
  }

  if (facts.fromSolarSystemId === facts.toSolarSystemId) {
    return facts.sameSystemStateChange ? 'same-system-state' : 'stationary';
  }

  const touchesWormholeSpace =
    geography.isWormholeSpace(facts.fromSolarSystemId) ||
    geography.isWormholeSpace(facts.toSolarSystemId);
  const gateLinked =
    !touchesWormholeSpace &&
    geography.gateLinked(facts.fromSolarSystemId, facts.toSolarSystemId);

  if (facts.shipBecameCapsule && !gateLinked) {
    return 're-anchor';
  }

  return gateLinked ? 'gate-placement' : 'hole-crossing';
}
