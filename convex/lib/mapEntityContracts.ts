import { v } from 'convex/values';
import {
  WORMHOLE_SIZE_CLASSES,
  isWormholeTypeCode,
  type WormholeSizeClass,
} from '../../src/data/eve-data/wormhole-contract';

const CONNECTION_MASS_STATES = [
  'stable',
  'reduced',
  'critical',
] as const;

type ConnectionMassState = (typeof CONNECTION_MASS_STATES)[number];

/** Convex validator for one connection mass state. */
export const connectionMassStateValidator = v.union(
  v.literal(CONNECTION_MASS_STATES[0]),
  v.literal(CONNECTION_MASS_STATES[1]),
  v.literal(CONNECTION_MASS_STATES[2]),
);

/** Convex validator for a nullable wormhole jump-size class. */
export const nullableWormholeSizeValidator = v.union(
  v.literal(WORMHOLE_SIZE_CLASSES[0]),
  v.literal(WORMHOLE_SIZE_CLASSES[1]),
  v.literal(WORMHOLE_SIZE_CLASSES[2]),
  v.literal(WORMHOLE_SIZE_CLASSES[3]),
  v.null(),
);

/** Convex validator for a note target kind. */
export const noteTargetKindValidator = v.union(
  v.literal('map'),
  v.literal('system'),
  v.literal('signature'),
);

/** One validated connection fixture payload. */
interface ConnectionInput {
  mapId: string;
  fromSystemId: number;
  toSystemId: number;
  wormholeTypeCode: string | null;
  massState: ConnectionMassState;
  shipSize: WormholeSizeClass | null;
  eolAt: number | null;
}

/** Returns whether a number is a positive safe integer identifier. */
export function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** Validates the cross-field invariants for one connection fixture. */
export function validateConnectionInput(input: ConnectionInput): void {
  if (
    !isPositiveSafeInteger(input.fromSystemId) ||
    !isPositiveSafeInteger(input.toSystemId)
  ) {
    throw new Error('Connection endpoints must be positive safe integers.');
  }
  if (input.fromSystemId === input.toSystemId) {
    throw new Error('Connection endpoints must be distinct.');
  }
  if (
    input.wormholeTypeCode !== null &&
    !isWormholeTypeCode(input.wormholeTypeCode)
  ) {
    throw new Error('Connection wormhole type code is not canonical.');
  }
  if (input.eolAt !== null && !Number.isFinite(input.eolAt)) {
    throw new Error('Connection EOL must be a finite absolute timestamp.');
  }
}

/** Normalized signature knowledge stored on a collaborative payload row. */
interface SignatureKnowledge {
  group: string | null;
  typeName: string | null;
  wormholeTypeCode: string | null;
}

/** Result of comparing a partial observation with stored signature knowledge. */
type SignatureMergeResult =
  | { status: 'unchanged'; knowledge: SignatureKnowledge }
  | { status: 'enriched'; knowledge: SignatureKnowledge }
  | { status: 'conflict'; knowledge: SignatureKnowledge };

function normalizedText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Normalizes and validates one partial signature observation. */
export function normalizeSignatureKnowledge(
  knowledge: SignatureKnowledge,
): SignatureKnowledge {
  const normalized = {
    group: normalizedText(knowledge.group),
    typeName: normalizedText(knowledge.typeName),
    wormholeTypeCode: normalizedText(knowledge.wormholeTypeCode),
  };
  if (
    normalized.wormholeTypeCode !== null &&
    !isWormholeTypeCode(normalized.wormholeTypeCode)
  ) {
    throw new Error('Signature wormhole type code is not canonical.');
  }
  if (
    normalized.wormholeTypeCode !== null &&
    normalized.group !== 'wormhole'
  ) {
    throw new Error('A wormhole type code requires the wormhole group.');
  }
  return normalized;
}

/**
 * Monotonically merges partial signature knowledge. Unknown values never erase
 * known values, and differing known values require a later explicit correction.
 */
export function mergeSignatureKnowledge(
  existing: SignatureKnowledge,
  incoming: SignatureKnowledge,
): SignatureMergeResult {
  const normalizedExisting = normalizeSignatureKnowledge(existing);
  const normalizedIncoming = normalizeSignatureKnowledge(incoming);
  const keys = ['group', 'typeName', 'wormholeTypeCode'] as const;
  let enriched = false;
  const merged = { ...normalizedExisting };

  for (const key of keys) {
    const before = normalizedExisting[key];
    const observed = normalizedIncoming[key];
    if (observed === null || observed === before) continue;
    if (before !== null) {
      return { status: 'conflict', knowledge: normalizedExisting };
    }
    merged[key] = observed;
    enriched = true;
  }
  return {
    status: enriched ? 'enriched' : 'unchanged',
    knowledge: merged,
  };
}

