import { systemSecurityClass } from './security';

export const WORMHOLE_SIZE_CLASSES = ['S', 'M', 'L', 'XL'] as const;

export type WormholeSizeClass = (typeof WORMHOLE_SIZE_CLASSES)[number];

export function wormholeSizeClass(maxJumpMass: number): WormholeSizeClass {
  if (maxJumpMass <= 5_000_000) return 'S';
  if (maxJumpMass <= 62_000_000) return 'M';
  if (maxJumpMass <= 410_000_000) return 'L';
  return 'XL';
}

export const WORMHOLE_DESTINATION_HINTS = [
  'hisec',
  'lowsec',
  'nullsec',
  'unknown',
  'dangerous',
  'deadly',
  'thera',
  'pochven',
  'drifter',
] as const;

export type WormholeDestinationHint = (typeof WORMHOLE_DESTINATION_HINTS)[number];

export const CONNECTION_PROVENANCES = [
  'jump-verified',
  'human',
  'confirmed',
  'assumed',
] as const;

export type ConnectionProvenance = (typeof CONNECTION_PROVENANCES)[number];

export interface WormholeSystemClassFacts {
  readonly wormholeClassId: number | null;
  readonly securityStatus: number | null;
}

const HINT_CLASSES = {
  hisec: [7],
  lowsec: [8],
  nullsec: [9],
  unknown: [1, 2, 3, 13],
  dangerous: [4, 5],
  deadly: [6],
  thera: [12],
  pochven: [25],
} as const satisfies Record<
  Exclude<WormholeDestinationHint, 'drifter'>,
  readonly number[]
>;

const COVERED_DESTINATION_CLASSES = new Set<number>(
  Object.values(HINT_CLASSES).flat(),
);

export function effectiveWormholeClassId(
  facts: WormholeSystemClassFacts,
): number | null {
  if (facts.wormholeClassId !== null) return facts.wormholeClassId;
  if (facts.securityStatus === null) return null;
  return {
    high: 7,
    low: 8,
    null: 9,
    wormhole: null,
  }[systemSecurityClass(facts.securityStatus, null)];
}

export function hintAdmitsClass(
  hint: WormholeDestinationHint,
  destination: WormholeSystemClassFacts,
): boolean {
  const effectiveClassId = effectiveWormholeClassId(destination);

  if (effectiveClassId === null || !COVERED_DESTINATION_CLASSES.has(effectiveClassId)) {
    return true;
  }
  if (hint === 'drifter') return false;
  return (HINT_CLASSES[hint] as readonly number[]).includes(effectiveClassId);
}

export function destinationHintSoleClassId(
  hint: WormholeDestinationHint,
): number | null {
  if (hint === 'drifter') return 14;
  const classes = HINT_CLASSES[hint];
  return classes.length === 1 ? classes[0]! : null;
}

export const CONNECTION_MASS_STATES = ['stable', 'reduced', 'critical'] as const;

export type ConnectionMassState = (typeof CONNECTION_MASS_STATES)[number];

const WORMHOLE_MASS_VARIANCE = 0.1;

const WORMHOLE_MASS_STATE_THRESHOLDS = {
  stable: { minFraction: 0.5, maxFraction: 1 },
  reduced: { minFraction: 0.1, maxFraction: 0.5 },
  critical: { minFraction: 0, maxFraction: 0.1 },
  unset: { minFraction: 0, maxFraction: 1 },
} as const satisfies Record<
  ConnectionMassState | 'unset',
  { readonly minFraction: number; readonly maxFraction: number }
>;

export interface WormholeMassFacts {
  readonly totalMass: number;
  readonly massRegen: number;
}

export interface RemainingMassBounds {
  readonly minKg: number;
  readonly maxKg: number;
}

export function remainingMassBounds(
  entry: WormholeMassFacts | null | undefined,
  massState: ConnectionMassState | null,
): RemainingMassBounds | null {
  if (
    entry === null ||
    entry === undefined ||
    !Number.isFinite(entry.totalMass) ||
    entry.totalMass <= 0 ||
    !Number.isFinite(entry.massRegen) ||
    entry.massRegen !== 0
  ) {
    return null;
  }

  const threshold = WORMHOLE_MASS_STATE_THRESHOLDS[massState ?? 'unset'];
  return {
    minKg: Math.round(
      threshold.minFraction *
        (1 - WORMHOLE_MASS_VARIANCE) *
        entry.totalMass,
    ),
    maxKg: Math.round(
      threshold.maxFraction *
        (1 + WORMHOLE_MASS_VARIANCE) *
        entry.totalMass,
    ),
  };
}

export function remainingMassAfterTravel(
  entry: WormholeMassFacts | null | undefined,
  massState: ConnectionMassState | null,
  observedMassKg: number | null | undefined,
  observedMassAtStateKg: number | null | undefined,
): RemainingMassBounds | null {
  const bounds = remainingMassBounds(entry, massState);
  if (bounds === null) return null;
  if (
    (observedMassKg !== null &&
      observedMassKg !== undefined &&
      (!Number.isFinite(observedMassKg) || observedMassKg < 0)) ||
    (observedMassAtStateKg !== null &&
      observedMassAtStateKg !== undefined &&
      (!Number.isFinite(observedMassAtStateKg) || observedMassAtStateKg < 0))
  ) {
    return null;
  }

  if (
    observedMassKg !== null &&
    observedMassKg !== undefined &&
    observedMassAtStateKg !== null &&
    observedMassAtStateKg !== undefined &&
    observedMassKg < observedMassAtStateKg
  ) {
    return null;
  }

  const travelledKg = Math.max(
    0,
    (observedMassKg ?? 0) - (observedMassAtStateKg ?? 0),
  );
  return {
    minKg: Math.max(0, Math.round(bounds.minKg - travelledKg)),
    maxKg: Math.max(0, Math.round(bounds.maxKg - travelledKg)),
  };
}

export function isKnownSpaceSystemId(systemId: number): boolean {
  return systemId < 31_000_000;
}

export const WORMHOLE_LIFE_STAGES = [
  'under_1_day',
  'under_4_hours',
  'under_1_hour',
  'expired',
] as const;

export type WormholeLifeStage = (typeof WORMHOLE_LIFE_STAGES)[number];

export const FAR_SIDE_WORMHOLE_CODE = 'K162';

export const WORMHOLE_TYPE_CODE = /^[A-Z]\d{3}$/;

export function isWormholeTypeCode(value: string): boolean {
  return WORMHOLE_TYPE_CODE.test(value);
}
