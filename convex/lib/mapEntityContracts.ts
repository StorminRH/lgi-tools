// Convex-local chain entity rules: the connection/note boundary validators and the pure
// signature-knowledge merge. These are shared ONLY by convex/schema.ts and the fixture boundary in
// convex/mapFixtures.ts — they are deliberately not exported to src/, because the durable side owns
// no chain payload. The stable wormhole/size vocabulary is imported from its single pure owner in
// the eve-data reference core rather than re-declared here.
import { ConvexError, v } from 'convex/values';
import {
  CONNECTION_MASS_STATES,
  isWormholeTypeCode,
  WORMHOLE_LIFE_STAGES,
  type ConnectionMassState,
  type WormholeLifeStage,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { MapRole } from '@/data/maps/access-contract';
import { MAP_EVENT_KINDS } from '@/data/maps/chain-events';

/** Re-export the data-owned mass vocabulary for Convex-local callers. */
export { CONNECTION_MASS_STATES, type ConnectionMassState };
/** Re-export the data-owned life-stage vocabulary for Convex-local callers. */
export { WORMHOLE_LIFE_STAGES, type WormholeLifeStage };

/** The kinds of chain object a note may be attached to. */
export const NOTE_TARGET_KINDS = ['map', 'system', 'signature'] as const;

/** One note target kind. */
export type NoteTargetKind = (typeof NOTE_TARGET_KINDS)[number];

// Convex validators need literal unions, but the vocabularies they encode are owned here or in
// src/data. `satisfies` binds each literal set to its owner: widening a vocabulary without
// widening the validator here becomes a compile error instead of a runtime rejection that would
// only surface once a real writer tried to store the new value.
const MASS_STATE_LITERALS = {
  stable: v.literal('stable'),
  reduced: v.literal('reduced'),
  critical: v.literal('critical'),
} as const satisfies Record<ConnectionMassState, unknown>;

const LIFE_STAGE_LITERALS = {
  under_1_day: v.literal('under_1_day'),
  under_4_hours: v.literal('under_4_hours'),
  under_1_hour: v.literal('under_1_hour'),
  expired: v.literal('expired'),
} as const satisfies Record<WormholeLifeStage, unknown>;

const NOTE_TARGET_KIND_LITERALS = {
  map: v.literal('map'),
  system: v.literal('system'),
  signature: v.literal('signature'),
} as const satisfies Record<NoteTargetKind, unknown>;

const SHIP_SIZE_LITERALS = {
  S: v.literal('S'),
  M: v.literal('M'),
  L: v.literal('L'),
  XL: v.literal('XL'),
} as const satisfies Record<WormholeSizeClass, unknown>;

const MAP_ROLE_LITERALS = {
  viewer: v.literal('viewer'),
  editor: v.literal('editor'),
  owner: v.literal('owner'),
} as const satisfies Record<MapRole, unknown>;

/** Convex-local rollout owner for the closed destination-hint vocabulary. */
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

/** One stored destination-hint bucket. */
export type WormholeDestinationHint = (typeof WORMHOLE_DESTINATION_HINTS)[number];

/** Convex-local rollout owner for connection identity provenance. */
export const CONNECTION_PROVENANCES = [
  'jump-verified',
  'human',
  'confirmed',
  'assumed',
] as const;

/** One stored connection identity provenance tier. */
export type ConnectionProvenance = (typeof CONNECTION_PROVENANCES)[number];

/** Schema validator for the side whose wormhole type is attributable. */
export const typedSideValidator = v.union(v.literal('from'), v.literal('to'));

/** Schema validator for the closed destination-hint vocabulary. */
export const destinationHintValidator = v.union(
  ...WORMHOLE_DESTINATION_HINTS.map((hint) => v.literal(hint)),
);

/** Schema validator for connection identity provenance. */
export const connectionProvenanceValidator = v.union(
  ...CONNECTION_PROVENANCES.map((provenance) => v.literal(provenance)),
);

/** Schema validator for observed mass state, null while still unobserved. */
export const massStateValidator = v.union(
  MASS_STATE_LITERALS.stable,
  MASS_STATE_LITERALS.reduced,
  MASS_STATE_LITERALS.critical,
  v.null(),
);

/** Schema validator for a Reliable Lifetime bucket, null while still unset. */
export const lifeStageValidator = v.union(
  LIFE_STAGE_LITERALS.under_1_day,
  LIFE_STAGE_LITERALS.under_4_hours,
  LIFE_STAGE_LITERALS.under_1_hour,
  LIFE_STAGE_LITERALS.expired,
  v.null(),
);

/**
 * Optional normalized tombstone stamp. Existing live rows may omit the field;
 * active rows may store explicit null; tombstoned rows store a finite number.
 */
export const optionalTimestampValidator = v.optional(v.union(v.number(), v.null()));

/** Schema validator for a connection's shipped size, null while still unknown. */
export const shipSizeValidator = v.union(
  SHIP_SIZE_LITERALS.S,
  SHIP_SIZE_LITERALS.M,
  SHIP_SIZE_LITERALS.L,
  SHIP_SIZE_LITERALS.XL,
  v.null(),
);

/** Schema validator for the projected role claim, bound to the shared Neon role vocabulary. */
export const mapRoleValidator = v.union(
  MAP_ROLE_LITERALS.viewer,
  MAP_ROLE_LITERALS.editor,
  MAP_ROLE_LITERALS.owner,
);

/**
 * Schema validator derived from the data-owned event-kind tuple, so a kind
 * added to the vocabulary reaches the deployed schema without a hand edit.
 */
export const mapEventKindValidator = v.union(
  ...MAP_EVENT_KINDS.map((kind) => v.literal(kind)),
);

/** Schema validator for the payload shapes written by the basic map-event ledger. */
export const mapEventPayloadValidator = v.union(
  v.object({ connectionId: v.string() }),
  v.object({ connectionId: v.string(), systemIds: v.array(v.number()) }),
);

/** Schema validator for a canonical wormhole code, null while the type is unidentified. */
export const wormholeTypeCodeValidator = v.union(v.string(), v.null());

/** Schema validator for the kind of chain object a note targets. */
export const noteTargetKindValidator = v.union(
  NOTE_TARGET_KIND_LITERALS.map,
  NOTE_TARGET_KIND_LITERALS.system,
  NOTE_TARGET_KIND_LITERALS.signature,
);

/** Rejects a chain-boundary value that must never reach a stored document. */
function reject(code: string, detail: string): never {
  throw new ConvexError({ code, detail });
}

/** Whether a value is a usable EVE identity: a positive, finite, safe integer. */
export function isPositiveId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Validates one absolute timestamp field. Chain documents store absolute instants only —
 * remaining lifetime derives from the `deathEarliestAt`/`deathLatestAt` window pair
 * (`eolAt` is a vestigial superseded field, always null) and no mutation or scheduler
 * flips a state.
 */
function requireAbsoluteTimestamp(label: string, value: number | null): void {
  if (value !== null && !Number.isFinite(value)) {
    reject('INVALID_TIMESTAMP', `${label} must be an absolute finite timestamp or null.`);
  }
}

/** One connection's validated boundary input. */
export interface ConnectionInput {
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly wormholeTypeCode: string | null;
  readonly massState: ConnectionMassState | null;
  readonly shipSize: WormholeSizeClass | null;
  readonly eolAt: number | null;
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
}

/** The fixture boundary for a scanned wormhole whose far endpoint is unresolved. */
export interface UnresolvedHoleInput {
  readonly fromSystemId: number;
  readonly toSystemId: null;
  readonly fromSignatureId: string;
  readonly wormholeTypeCode: string | null;
  readonly shipSize: WormholeSizeClass | null;
  readonly fromDestinationHint?: WormholeDestinationHint;
}

/** The optional-normalized absolute death-window pair accepted at the boundary. */
export interface DeathWindowInput {
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
}

/** Requires a death window to be either wholly absent or ordered and finite. */
export function validateDeathWindowInput(input: DeathWindowInput): void {
  const earliest = input.deathEarliestAt ?? null;
  const latest = input.deathLatestAt ?? null;
  if ((earliest === null) !== (latest === null)) {
    reject('INVALID_DEATH_WINDOW', 'Death-window timestamps must both be null or both be set.');
  }
  if (earliest === null || latest === null) return;
  if (!Number.isFinite(earliest) || !Number.isFinite(latest) || earliest > latest) {
    reject('INVALID_DEATH_WINDOW', 'Death-window timestamps must be finite and ordered.');
  }
}

/**
 * The authoritative connection boundary: endpoints must be distinct positive system IDs, a non-null
 * wormhole code must be canonical, and `eolAt` must be an absolute timestamp. Endpoint *existence*
 * and same-map ownership are checked by the calling mutation, which alone can read the database.
 */
export function validateConnectionInput(input: ConnectionInput): void {
  if (!isPositiveId(input.fromSystemId) || !isPositiveId(input.toSystemId)) {
    reject('INVALID_SYSTEM_ID', 'Connection endpoints must be positive safe integers.');
  }
  if (input.fromSystemId === input.toSystemId) {
    reject('SELF_LOOP_CONNECTION', 'A connection must join two distinct systems.');
  }
  if (input.wormholeTypeCode !== null && !isWormholeTypeCode(input.wormholeTypeCode)) {
    reject('INVALID_WORMHOLE_CODE', `Unknown wormhole code "${input.wormholeTypeCode}".`);
  }
  requireAbsoluteTimestamp('eolAt', input.eolAt);
  validateDeathWindowInput(input);
}

/**
 * Validates an unresolved wormhole row without weakening the established
 * two-endpoint connection boundary used by shipped authoring fixtures.
 */
export function validateUnresolvedHoleInput(input: UnresolvedHoleInput): void {
  if (!isPositiveId(input.fromSystemId)) {
    reject('INVALID_SYSTEM_ID', 'An unresolved hole origin must be a positive safe integer.');
  }
  if (input.toSystemId !== null) {
    reject('INVALID_UNRESOLVED_HOLE', 'An unresolved hole must have a null destination.');
  }
  if (input.fromSignatureId.trim() === '') {
    reject('INVALID_SIGNATURE_ID', 'An unresolved hole needs an origin signature ID.');
  }
  if (input.wormholeTypeCode !== null && !isWormholeTypeCode(input.wormholeTypeCode)) {
    reject('INVALID_WORMHOLE_CODE', `Unknown wormhole code "${input.wormholeTypeCode}".`);
  }
}

/** The nullable knowledge fields the map shares about one signature. */
export interface SignatureKnowledge {
  readonly group: string | null;
  readonly typeName: string | null;
  readonly wormholeTypeCode: string | null;
}

const KNOWLEDGE_FIELDS = ['group', 'typeName', 'wormholeTypeCode'] as const;

/** The outcome of merging one observation into a stored signature. */
export type SignatureMergeResult =
  | { readonly outcome: 'unchanged' }
  | { readonly outcome: 'enriched'; readonly patch: Partial<SignatureKnowledge> }
  | { readonly outcome: 'conflict'; readonly fields: readonly string[] };

/** Normalizes a blank or unresolved observation value to the stored null. */
function normalizeKnowledgeValue(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Normalizes every knowledge field of one incoming observation. */
export function normalizeSignatureKnowledge(
  input: Partial<SignatureKnowledge>,
): SignatureKnowledge {
  return {
    group: normalizeKnowledgeValue(input.group),
    typeName: normalizeKnowledgeValue(input.typeName),
    wormholeTypeCode: normalizeKnowledgeValue(input.wormholeTypeCode),
  };
}

/**
 * Validates one incoming observation before it can reach the merge. A non-null wormhole code is
 * meaningful only on a wormhole signature, and must be canonical — an unidentified wormhole keeps
 * its group with a null code rather than inventing a placeholder type.
 */
export function validateSignatureKnowledge(knowledge: SignatureKnowledge): void {
  if (knowledge.wormholeTypeCode === null) return;
  if (!isWormholeTypeCode(knowledge.wormholeTypeCode)) {
    reject('INVALID_WORMHOLE_CODE', `Unknown wormhole code "${knowledge.wormholeTypeCode}".`);
  }
  if (knowledge.group !== 'wormhole') {
    reject('INCOHERENT_SIGNATURE', 'A wormhole code requires the wormhole group.');
  }
}

/**
 * The one monotonic merge contract for signature knowledge. An incoming null preserves what the map
 * already knows, an equal value is a no-op, a non-null value fills a stored null, and two differing
 * non-null values are reported as a conflict without any patch — corrections belong to an explicit
 * later override path, never to an ordinary observation. It never decides absence or deletion.
 */
export function mergeSignatureKnowledge(
  existing: SignatureKnowledge,
  incoming: SignatureKnowledge,
): SignatureMergeResult {
  const patch: Record<string, string> = {};
  const conflicts: string[] = [];

  for (const field of KNOWLEDGE_FIELDS) {
    const next = incoming[field];
    const stored = existing[field];
    if (next === null || next === stored) continue;
    if (stored === null) patch[field] = next;
    else conflicts.push(field);
  }

  if (conflicts.length > 0) return { outcome: 'conflict', fields: conflicts };
  if (Object.keys(patch).length === 0) return { outcome: 'unchanged' };
  return { outcome: 'enriched', patch };
}
