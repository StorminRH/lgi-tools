import {
  FAR_SIDE_WORMHOLE_CODE,
  WORMHOLE_SIZE_CLASSES,
  isWormholeTypeCode,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';

/** Connection mass observation vocabulary shared by schema and fixtures. */
export const CONNECTION_MASS_STATES = ['stable', 'reduced', 'critical'] as const;
/** One connection mass observation state. */
export type ConnectionMassState = (typeof CONNECTION_MASS_STATES)[number];

/** Note target kinds admitted by the collaborative note document. */
export const NOTE_TARGET_KINDS = ['map', 'system', 'signature'] as const;
/** One note target kind. */
export type NoteTargetKind = (typeof NOTE_TARGET_KINDS)[number];

/** Nullable knowledge fields carried on a signature payload. */
export interface SignatureKnowledge {
  readonly group: string | null;
  readonly typeName: string | null;
  readonly wormholeTypeCode: string | null;
}

/** Result of the keyed monotonic signature-knowledge merge. */
export type SignatureMergeResult =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'enriched'; readonly next: SignatureKnowledge }
  | { readonly kind: 'conflict' };

/** Validated connection insert payload before same-map endpoint existence checks. */
export interface ValidatedConnectionInput {
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly wormholeTypeCode: string | null;
  readonly massState: ConnectionMassState;
  readonly shipSize: WormholeSizeClass | null;
  readonly eolAt: number | null;
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** True when `value` is a positive safe integer. */
export function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** True when `value` is a finite absolute timestamp. */
export function isFiniteTimestamp(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Normalizes and validates connection fields for the Convex boundary. Rejects
 * self-loops, non-positive endpoints, invalid codes/sizes, and non-finite EOL.
 */
export function validateConnectionInput(input: {
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly wormholeTypeCode: string | null;
  readonly massState: string;
  readonly shipSize: string | null;
  readonly eolAt: number | null;
}): ValidatedConnectionInput {
  if (input.mapId.trim() === '') {
    throw new Error('mapId must be a non-empty string');
  }
  if (
    !isPositiveSafeInteger(input.fromSystemId) ||
    !isPositiveSafeInteger(input.toSystemId)
  ) {
    throw new Error('connection endpoints must be positive safe integers');
  }
  if (input.fromSystemId === input.toSystemId) {
    throw new Error('connection endpoints must be distinct');
  }
  const wormholeTypeCode = blankToNull(input.wormholeTypeCode);
  if (wormholeTypeCode !== null && !isWormholeTypeCode(wormholeTypeCode)) {
    throw new Error('wormholeTypeCode must be canonical or null');
  }
  if (
    !CONNECTION_MASS_STATES.includes(input.massState as ConnectionMassState)
  ) {
    throw new Error('massState must be stable, reduced, or critical');
  }
  if (
    input.shipSize !== null &&
    !WORMHOLE_SIZE_CLASSES.includes(input.shipSize as WormholeSizeClass)
  ) {
    throw new Error('shipSize must be S, M, L, XL, or null');
  }
  if (input.eolAt !== null && !isFiniteTimestamp(input.eolAt)) {
    throw new Error('eolAt must be a finite absolute timestamp or null');
  }
  return {
    mapId: input.mapId,
    fromSystemId: input.fromSystemId,
    toSystemId: input.toSystemId,
    wormholeTypeCode,
    massState: input.massState as ConnectionMassState,
    shipSize: input.shipSize as WormholeSizeClass | null,
    eolAt: input.eolAt,
  };
}

/**
 * Validates a note target constructor before insertion. Map notes must repeat
 * `mapId`; system and signature notes carry the matching Convex document ID.
 */
export function validateNoteTargetInput(input: {
  readonly mapId: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly body: string;
}): {
  readonly mapId: string;
  readonly targetKind: NoteTargetKind;
  readonly targetId: string;
  readonly body: string;
} {
  if (input.mapId.trim() === '') {
    throw new Error('mapId must be a non-empty string');
  }
  if (!NOTE_TARGET_KINDS.includes(input.targetKind as NoteTargetKind)) {
    throw new Error('targetKind must be map, system, or signature');
  }
  if (input.targetId.trim() === '') {
    throw new Error('targetId must be a non-empty string');
  }
  if (input.targetKind === 'map' && input.targetId !== input.mapId) {
    throw new Error('map note targetId must equal mapId');
  }
  return {
    mapId: input.mapId,
    targetKind: input.targetKind as NoteTargetKind,
    targetId: input.targetId,
    body: input.body,
  };
}

/**
 * Validates reversible tombstone timestamps. Active rows hold both null; tombstoned
 * rows require finite absolute timestamps with purgeAfter strictly after deletedAt.
 */
export function validateTombstoneTimestamps(
  deletedAt: number | null,
  purgeAfter: number | null,
): void {
  if (deletedAt === null && purgeAfter === null) return;
  if (deletedAt === null || purgeAfter === null) {
    throw new Error('deletedAt and purgeAfter must both be null or both set');
  }
  if (!isFiniteTimestamp(deletedAt) || !isFiniteTimestamp(purgeAfter)) {
    throw new Error('tombstone timestamps must be finite');
  }
  if (!(purgeAfter > deletedAt)) {
    throw new Error('purgeAfter must be greater than deletedAt');
  }
}

/**
 * Normalizes signature knowledge and validates wormhole-code/group coupling before merge.
 */
export function normalizeSignatureKnowledge(input: {
  readonly group?: string | null;
  readonly typeName?: string | null;
  readonly wormholeTypeCode?: string | null;
}): SignatureKnowledge {
  const group = blankToNull(input.group);
  const typeName = blankToNull(input.typeName);
  const wormholeTypeCode = blankToNull(input.wormholeTypeCode);
  if (wormholeTypeCode !== null) {
    if (!isWormholeTypeCode(wormholeTypeCode)) {
      throw new Error('wormholeTypeCode must be canonical or null');
    }
    if (group !== 'wormhole') {
      throw new Error('non-null wormholeTypeCode requires group wormhole');
    }
  }
  return { group, typeName, wormholeTypeCode };
}

/**
 * Pure keyed-field merge for signature knowledge. Incoming nulls preserve stored
 * values; equality no-ops; null-to-non-null enriches; differing non-null values
 * conflict without a patch. Absence and deletion are never decided here.
 */
export function mergeSignatureKnowledge(
  existing: SignatureKnowledge,
  incoming: SignatureKnowledge,
): SignatureMergeResult {
  const fields = ['group', 'typeName', 'wormholeTypeCode'] as const;
  let changed = false;
  const next: SignatureKnowledge = {
    group: existing.group,
    typeName: existing.typeName,
    wormholeTypeCode: existing.wormholeTypeCode,
  };

  for (const field of fields) {
    const current = existing[field];
    const value = incoming[field];
    if (value === null || value === current) continue;
    if (current === null) {
      (next as { [K in typeof field]: string | null })[field] = value;
      changed = true;
      continue;
    }
    return { kind: 'conflict' };
  }

  if (
    next.wormholeTypeCode !== null &&
    next.group !== 'wormhole'
  ) {
    return { kind: 'conflict' };
  }

  return changed ? { kind: 'enriched', next } : { kind: 'unchanged' };
}

/** Re-export far-side code for fixture assertions without reaching into eve-data types. */
export { FAR_SIDE_WORMHOLE_CODE, WORMHOLE_SIZE_CLASSES, isWormholeTypeCode };
