import { ConvexError, type Infer, v } from 'convex/values';
import {
  CONNECTION_PROVENANCES,
  CONNECTION_MASS_STATES,
  isWormholeTypeCode,
  WORMHOLE_DESTINATION_HINTS,
  WORMHOLE_LIFE_STAGES,
  type ConnectionProvenance,
  type ConnectionMassState,
  type WormholeDestinationHint,
  type WormholeLifeStage,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { MapRole } from '@/data/maps/access-contract';
import { MAP_EVENT_KINDS } from '@/data/maps/chain-events';
import {
  SCANNED_KINDS,
  SIG_GROUPS,
  type ScannedKind,
} from '@/data/maps/scan-parse';

export { CONNECTION_MASS_STATES, type ConnectionMassState };
export { WORMHOLE_LIFE_STAGES, type WormholeLifeStage };
export { WORMHOLE_DESTINATION_HINTS, type WormholeDestinationHint };
export { CONNECTION_PROVENANCES, type ConnectionProvenance };

export const NOTE_TARGET_KINDS = ['map', 'system', 'signature'] as const;

export type NoteTargetKind = (typeof NOTE_TARGET_KINDS)[number];

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
  admin: v.literal('admin'),
} as const satisfies Record<MapRole, unknown>;

export const legacyMapOwnerRoleValidator = v.literal('owner');

export type StoredMapRole = MapRole | Infer<typeof legacyMapOwnerRoleValidator>;

export const connectionDoorSideValidator = v.union(v.literal('from'), v.literal('to'));

export const scannedKindValidator = v.union(
  ...SCANNED_KINDS.map((kind) => v.literal(kind)),
);

export const sigGroupValidator = v.union(
  ...SIG_GROUPS.map((group) => v.literal(group)),
);

export const destinationHintValidator = v.union(
  ...WORMHOLE_DESTINATION_HINTS.map((hint) => v.literal(hint)),
);

export const connectionProvenanceValidator = v.union(
  ...CONNECTION_PROVENANCES.map((provenance) => v.literal(provenance)),
);

export const massStateValidator = v.union(
  MASS_STATE_LITERALS.stable,
  MASS_STATE_LITERALS.reduced,
  MASS_STATE_LITERALS.critical,
  v.null(),
);

export const lifeStageValidator = v.union(
  LIFE_STAGE_LITERALS.under_1_day,
  LIFE_STAGE_LITERALS.under_4_hours,
  LIFE_STAGE_LITERALS.under_1_hour,
  LIFE_STAGE_LITERALS.expired,
  v.null(),
);

export const wormholeTypeCodeValidator = v.union(v.string(), v.null());

export const optionalTimestampValidator = v.optional(v.union(v.number(), v.null()));

const doorLeadsToValidator = v.union(
  v.object({ kind: v.literal('unset') }),
  v.object({ kind: v.literal('hint'), hint: destinationHintValidator }),
  v.object({ kind: v.literal('system'), systemId: v.number() }),
);

export const connectionDoorValidator = v.object({
  typeCode: wormholeTypeCodeValidator,
  signatureId: v.union(v.string(), v.null()),
  signalPct: v.union(v.number(), v.null()),
  leadsTo: doorLeadsToValidator,
});

export const connectionIdentityValidator = v.union(
  v.object({ kind: v.literal('unknown') }),
  v.object({
    kind: v.literal('typed'),
    provenance: connectionProvenanceValidator,
  }),
);

export const connectionLifetimeValidator = v.union(
  v.object({ kind: v.literal('unknown') }),
  v.object({
    kind: v.literal('stage'),
    lifeStage: v.union(
      LIFE_STAGE_LITERALS.under_1_day,
      LIFE_STAGE_LITERALS.under_4_hours,
      LIFE_STAGE_LITERALS.under_1_hour,
      LIFE_STAGE_LITERALS.expired,
    ),
    observedAt: v.number(),
  }),
  v.object({
    kind: v.literal('window'),
    earliestAt: v.number(),
    latestAt: v.number(),
    lifeStage: lifeStageValidator,
    observedAt: v.union(v.number(), v.null()),
  }),
);

export const connectionResolutionValidator = v.union(
  v.object({ kind: v.literal('open') }),
  v.object({
    kind: v.literal('destination'),
    provenance: connectionProvenanceValidator,
  }),
  v.object({
    kind: v.literal('pending'),
    provenance: v.literal('assumed'),
    candidateIds: v.array(v.id('mapConnections')),
    characterId: v.number(),
  }),
);

export const connectionTombstoneValidator = v.union(
  v.object({ kind: v.literal('live') }),
  v.object({
    kind: v.literal('removed'),
    deletedAt: v.number(),
    purgeAfter: v.union(v.number(), v.null()),
  }),
);

export const shipSizeValidator = v.union(
  SHIP_SIZE_LITERALS.S,
  SHIP_SIZE_LITERALS.M,
  SHIP_SIZE_LITERALS.L,
  SHIP_SIZE_LITERALS.XL,
  v.null(),
);

export const currentMapRoleValidator = v.union(
  MAP_ROLE_LITERALS.viewer,
  MAP_ROLE_LITERALS.editor,
  MAP_ROLE_LITERALS.admin,
);

export const mapRoleValidator = v.union(
  MAP_ROLE_LITERALS.viewer,
  MAP_ROLE_LITERALS.editor,
  MAP_ROLE_LITERALS.admin,
  legacyMapOwnerRoleValidator,
);

export const mapEventKindValidator = v.union(
  ...MAP_EVENT_KINDS.map((kind) => v.literal(kind)),
);

export const mapEventPayloadValidator = v.union(
  v.object({ connectionId: v.string() }),
  v.object({ connectionId: v.string(), systemIds: v.array(v.number()) }),
  v.object({ systemId: v.number(), signatureIds: v.array(v.string()) }),
);

export const noteTargetKindValidator = v.union(
  NOTE_TARGET_KIND_LITERALS.map,
  NOTE_TARGET_KIND_LITERALS.system,
  NOTE_TARGET_KIND_LITERALS.signature,
);

function reject(code: string, detail: string): never {
  throw new ConvexError({ code, detail });
}

export function isPositiveId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function requireAbsoluteTimestamp(label: string, value: number | null): void {
  if (value !== null && !Number.isFinite(value)) {
    reject('INVALID_TIMESTAMP', `${label} must be an absolute finite timestamp or null.`);
  }
}

export interface ConnectionInput {
  readonly fromSystemId: number;
  readonly toSystemId: number;
  readonly wormholeTypeCode: string | null;
  readonly massState: ConnectionMassState | null;
  readonly shipSize: WormholeSizeClass | null;
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
}

export interface UnresolvedHoleInput {
  readonly fromSystemId: number;
  readonly toSystemId: null;
  readonly fromSignatureId: string;
  readonly wormholeTypeCode: string | null;
  readonly shipSize: WormholeSizeClass | null;
  readonly fromDestinationHint?: WormholeDestinationHint;
}

export interface DeathWindowInput {
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
}

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
  requireAbsoluteTimestamp('deathEarliestAt', input.deathEarliestAt ?? null);
  requireAbsoluteTimestamp('deathLatestAt', input.deathLatestAt ?? null);
  validateDeathWindowInput(input);
}

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

export interface SignatureKnowledge {
  readonly group: string | null;
  readonly typeName: string | null;
  readonly wormholeTypeCode: string | null;
  readonly kind?: ScannedKind;
  readonly signalPct?: number | null;
}

const TEXT_KNOWLEDGE_FIELDS = ['group', 'typeName', 'wormholeTypeCode'] as const;

export interface SignatureKnowledgePatch {
  group?: string | null;
  typeName?: string | null;
  wormholeTypeCode?: string | null;
  kind?: ScannedKind;
  signalPct?: number | null;
}

export type SignatureMergeResult =
  | { readonly outcome: 'unchanged' }
  | { readonly outcome: 'enriched'; readonly patch: SignatureKnowledgePatch }
  | { readonly outcome: 'conflict'; readonly fields: readonly string[] };

function normalizeKnowledgeValue(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeSignatureKnowledge(
  input: Partial<SignatureKnowledge>,
): SignatureKnowledge {
  return {
    group: normalizeKnowledgeValue(input.group),
    typeName: normalizeKnowledgeValue(input.typeName),
    wormholeTypeCode: normalizeKnowledgeValue(input.wormholeTypeCode),
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    ...(input.signalPct === undefined ? {} : { signalPct: input.signalPct }),
  };
}

export function validateSignatureKnowledge(knowledge: SignatureKnowledge): void {
  if (knowledge.kind !== undefined && !SCANNED_KINDS.includes(knowledge.kind)) {
    reject('INVALID_SIGNATURE_KIND', `Unknown signature kind "${knowledge.kind}".`);
  }
  if (
    knowledge.signalPct !== undefined
    && knowledge.signalPct !== null
    && (!Number.isFinite(knowledge.signalPct)
      || knowledge.signalPct < 0
      || knowledge.signalPct > 100)
  ) {
    reject('INVALID_SIGNAL_PERCENT', 'Signature signal must be between 0 and 100 percent.');
  }
  if (knowledge.wormholeTypeCode !== null) {
    if (!isWormholeTypeCode(knowledge.wormholeTypeCode)) {
      reject('INVALID_WORMHOLE_CODE', `Unknown wormhole code "${knowledge.wormholeTypeCode}".`);
    }
    if (knowledge.group?.toLowerCase() !== 'wormhole') {
      reject('INCOHERENT_SIGNATURE', 'A wormhole code requires the wormhole group.');
    }
  }
}

function mergeTextKnowledge(
  existing: SignatureKnowledge,
  incoming: SignatureKnowledge,
  patch: SignatureKnowledgePatch,
  conflicts: string[],
): void {
  for (const field of TEXT_KNOWLEDGE_FIELDS) {
    const next = incoming[field];
    const stored = existing[field];
    if (next === null || next === stored) continue;
    if (stored === null) patch[field] = next;
    else conflicts.push(field);
  }
}

function mergeKindKnowledge(
  existing: SignatureKnowledge,
  incoming: SignatureKnowledge,
  patch: SignatureKnowledgePatch,
  conflicts: string[],
): void {
  if (incoming.kind === undefined || incoming.kind === existing.kind) return;
  if (existing.kind === undefined) patch.kind = incoming.kind;
  else conflicts.push('kind');
}

function mergeSignalKnowledge(
  existing: SignatureKnowledge,
  incoming: SignatureKnowledge,
  patch: SignatureKnowledgePatch,
): void {
  const storedSignal = existing.signalPct ?? null;
  const incomingSignal = incoming.signalPct ?? null;
  if (incomingSignal !== null && (storedSignal === null || incomingSignal > storedSignal)) {
    patch.signalPct = incomingSignal;
  }
}

export function mergeSignatureKnowledge(
  existing: SignatureKnowledge,
  incoming: SignatureKnowledge,
): SignatureMergeResult {
  const patch: SignatureKnowledgePatch = {};
  const conflicts: string[] = [];

  mergeTextKnowledge(existing, incoming, patch, conflicts);
  mergeKindKnowledge(existing, incoming, patch, conflicts);
  mergeSignalKnowledge(existing, incoming, patch);

  if (conflicts.length > 0) return { outcome: 'conflict', fields: conflicts };
  if (Object.keys(patch).length === 0) return { outcome: 'unchanged' };
  return { outcome: 'enriched', patch };
}
