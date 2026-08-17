import type { ConnectionProvenance } from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';

/** One live scanner row not yet linked to a resolved connection. */
export interface EliminationSignature {
  readonly signatureId: string;
  readonly wormholeTypeCode: string | null;
  readonly typeProvenance: ConnectionProvenance | null;
}

/** Endpoint-local facts for one live resolved connection touching the system. */
export interface EliminationConnection {
  readonly connectionId: string;
  /** A code typed on this system's side, or null when only the far side is known. */
  readonly wormholeTypeCode: string | null;
  /** Whether this system's side of the connection already owns a scanner row. */
  readonly linkedSignature: boolean;
}

/** Plain cross-store evidence consumed by the pure signature eliminator. */
export interface EliminationInput {
  readonly staticTypeCodes: readonly string[];
  readonly signatures: readonly EliminationSignature[];
  readonly connections: readonly EliminationConnection[];
  readonly codex: readonly WormholeCodexEntry[];
}

interface AssumedDeduction {
  readonly signatureId: string;
  readonly provenance: 'assumed';
}

/** One machine-safe type fill or far-side connection link. */
export type EliminationDeduction = AssumedDeduction & (
  | { readonly typeCode: string }
  | {
      readonly connectionId: string;
      /**
       * The stub's type code when this link was decided (null when untyped).
       * The apply door rejects the write when the live stub no longer matches,
       * so a person cannot lose a concurrent retype to a stale link delete.
       */
      readonly expectedTypeCode: string | null;
    }
);

/** Pure deductions, or the deliberately indistinguishable quiet outcome. */
export interface EliminationResult {
  readonly deductions: readonly EliminationDeduction[];
  readonly quiet: boolean;
}

interface StaticSlots {
  readonly total: ReadonlyMap<string, number>;
  readonly remaining: Map<string, number>;
}

interface TypedLinks {
  readonly deductions: EliminationDeduction[];
  readonly linkedConnections: Set<string>;
  readonly linkedSignatures: Set<string>;
}

type FixedCrossing =
  | { readonly kind: 'crossed' }
  | { readonly kind: 'link'; readonly connection: EliminationConnection }
  | { readonly kind: 'ambiguous' };

const QUIET_RESULT: EliminationResult = { deductions: [], quiet: true };

function sameCodeMeaning(
  left: WormholeCodexEntry,
  right: WormholeCodexEntry,
): boolean {
  if (left.farSide !== right.farSide) return false;
  if (left.farSide) return true;
  if (right.farSide) return false;
  return left.totalMass === right.totalMass
    && left.maxJumpMass === right.maxJumpMass
    && left.massRegen === right.massRegen
    && left.lifetimeMinutes === right.lifetimeMinutes
    && left.sizeClass === right.sizeClass
    && left.targetClass === right.targetClass;
}

function codebook(input: EliminationInput): ReadonlyMap<string, WormholeCodexEntry> | null {
  const byCode = new Map<string, WormholeCodexEntry>();
  for (const entry of input.codex) {
    const existing = byCode.get(entry.code);
    if (existing !== undefined && !sameCodeMeaning(existing, entry)) return null;
    if (existing === undefined) byCode.set(entry.code, entry);
  }

  const staticsValid = input.staticTypeCodes.every((code) => {
    const entry = byCode.get(code);
    return entry !== undefined && !entry.farSide;
  });
  const factsValid = [...input.signatures, ...input.connections].every((fact) =>
    fact.wormholeTypeCode === null || byCode.has(fact.wormholeTypeCode),
  );
  return staticsValid && factsValid ? byCode : null;
}

function staticSlots(staticTypeCodes: readonly string[]): StaticSlots {
  const total = new Map<string, number>();
  for (const code of staticTypeCodes) {
    total.set(code, (total.get(code) ?? 0) + 1);
  }
  return { total, remaining: new Map(total) };
}

function claimStatic(slots: StaticSlots, code: string): 'claimed' | 'wanderer' | 'overclaimed' {
  if (!slots.total.has(code)) return 'wanderer';
  const remaining = slots.remaining.get(code) ?? 0;
  if (remaining === 0) return 'overclaimed';
  slots.remaining.set(code, remaining - 1);
  return 'claimed';
}

function connectionAdmits(
  connection: EliminationConnection,
  typeCode: string,
): boolean {
  // Untyped inbound lines do not uniquely admit K162 (or any other code).
  // Several K162s can share a system; the way home is a human Leads-to pick.
  return connection.wormholeTypeCode === typeCode;
}

function fixedType(signature: EliminationSignature): string | null {
  return signature.wormholeTypeCode !== null
    && signature.typeProvenance !== 'assumed'
    ? signature.wormholeTypeCode
    : null;
}

function competingSignatures(
  signatures: readonly EliminationSignature[],
  connection: EliminationConnection,
  slots: StaticSlots,
): number {
  return signatures.filter((signature) => {
    // Blank scanner rows can still be this connection's type. Operators type
    // holes one by one; counting only already-typed competitors would pin the
    // first K162 onto the way home while siblings are still unnamed.
    if (signature.wormholeTypeCode === null) return true;
    const code = fixedType(signature);
    return code !== null
      && (slots.remaining.get(code) ?? 0) === 0
      && connectionAdmits(connection, code);
  }).length;
}

function availableConnections(
  code: string,
  openConnections: readonly EliminationConnection[],
  linkedConnections: ReadonlySet<string>,
): EliminationConnection[] {
  return openConnections.filter(
    (connection) =>
      !linkedConnections.has(connection.connectionId)
      && connectionAdmits(connection, code),
  );
}

function crossFixedType(
  code: string,
  signatures: readonly EliminationSignature[],
  openConnections: readonly EliminationConnection[],
  linkedConnections: ReadonlySet<string>,
  slots: StaticSlots,
): FixedCrossing {
  const candidates = availableConnections(code, openConnections, linkedConnections);
  if ((slots.remaining.get(code) ?? 0) > 0) {
    if (candidates.length > 0) return { kind: 'ambiguous' };
    claimStatic(slots, code);
    return { kind: 'crossed' };
  }
  if (candidates.length === 0) {
    return slots.total.has(code) ? { kind: 'ambiguous' } : { kind: 'crossed' };
  }
  const [connection] = candidates;
  if (
    candidates.length > 1
    || connection === undefined
    || competingSignatures(signatures, connection, slots) !== 1
  ) {
    return { kind: 'ambiguous' };
  }
  return { kind: 'link', connection };
}

function crossFixedFacts(
  signatures: readonly EliminationSignature[],
  openConnections: readonly EliminationConnection[],
  slots: StaticSlots,
): TypedLinks | null {
  const deductions: EliminationDeduction[] = [];
  const linkedConnections = new Set<string>();
  const linkedSignatures = new Set<string>();

  for (const signature of signatures) {
    const code = fixedType(signature);
    if (code === null) continue;
    const crossing = crossFixedType(
      code,
      signatures,
      openConnections,
      linkedConnections,
      slots,
    );
    if (crossing.kind === 'ambiguous') return null;
    if (crossing.kind === 'link') {
      linkedConnections.add(crossing.connection.connectionId);
      linkedSignatures.add(signature.signatureId);
      deductions.push({
        signatureId: signature.signatureId,
        connectionId: crossing.connection.connectionId,
        provenance: 'assumed',
        expectedTypeCode: signature.wormholeTypeCode,
      });
    }
  }

  return { deductions, linkedConnections, linkedSignatures };
}

function openStaticFacts(slots: StaticSlots): {
  readonly code: string | null;
  readonly count: number;
} {
  let openCode: string | null = null;
  let openCount = 0;
  for (const [code, count] of slots.remaining) {
    if (count === 0) continue;
    openCode = code;
    openCount += count;
  }
  return { code: openCount === 1 ? openCode : null, count: openCount };
}

function bySignatureId(
  left: EliminationDeduction,
  right: EliminationDeduction,
): number {
  return left.signatureId.localeCompare(right.signatureId);
}

/**
 * Crosses fixed facts off a system's statics-plus-connections answer key and
 * returns only uniquely forced, assumed-tier deductions. Insufficiency and
 * contradiction both stay quiet, and no I/O or mutation occurs here.
 */
export function eliminateSignatures(input: EliminationInput): EliminationResult {
  if (codebook(input) === null) return QUIET_RESULT;

  const slots = staticSlots(input.staticTypeCodes);
  for (const connection of input.connections) {
    const code = connection.wormholeTypeCode;
    if (code !== null && claimStatic(slots, code) === 'overclaimed') {
      return QUIET_RESULT;
    }
  }

  const openConnections = input.connections.filter(
    (connection) => !connection.linkedSignature,
  );
  const crossed = crossFixedFacts(input.signatures, openConnections, slots);
  if (crossed === null) return QUIET_RESULT;

  const writable = input.signatures.filter(
    (signature) =>
      !crossed.linkedSignatures.has(signature.signatureId)
      && (
        signature.wormholeTypeCode === null
        || signature.typeProvenance === 'assumed'
      ),
  );
  const remainingConnections = openConnections.filter(
    (connection) => !crossed.linkedConnections.has(connection.connectionId),
  );
  const openStatics = openStaticFacts(slots);
  const openSlotCount = remainingConnections.length + openStatics.count;

  const deductions = [...crossed.deductions];
  const [signature] = writable;
  if (
    writable.length === 1
    && signature !== undefined
    && openSlotCount === 1
    && openStatics.code !== null
  ) {
    deductions.push({
      signatureId: signature.signatureId,
      typeCode: openStatics.code,
      provenance: 'assumed',
    });
  }

  deductions.sort(bySignatureId);
  return deductions.length === 0
    ? QUIET_RESULT
    : { deductions, quiet: false };
}
