/**
 * One stub per hole we believe exists. Unidentified scanned wormhole sigs are
 * presumed to be the statics first; only the surplus draws as Unknown.
 *
 * This is presentation accounting, not inference: it never assigns a type to
 * a signature. It only decides which already-known holes need their own ghost
 * on the canvas so the picture never double-counts a static or a known line.
 */

/** One stable slot in a system's statics multiset. */
export interface StaticStubSlot {
  readonly id: string;
  readonly code: string;
  readonly className: string;
}

/** One live scanned wormhole row that could draw its existing signature stub. */
export interface ScannedStubHole {
  readonly id: string;
  readonly wormholeTypeCode: string | null;
}

/** One already-drawn connection touching the system being accounted. */
export interface ConnectionStubHole {
  /** A code typed on this system's side, or null when the local side is unknown. */
  readonly wormholeTypeCode: string | null;
  /** Whether this system's side of the line is already linked to a signature. */
  readonly linkedSignature: boolean;
}

/** The exact derived leaves one system contributes to the canvas. */
export interface StubPlan {
  /** Guaranteed statics that are not already represented by a typed hole. */
  readonly staticStubs: readonly StaticStubSlot[];
  /** Scanned rows that need their own typed or Unknown stub. */
  readonly signatureStubIds: readonly string[];
  /** The suffix of unidentified scanned rows included in signatureStubIds. */
  readonly unknownCount: number;
}

/** Live, endpoint-local facts needed to account one system's believed holes. */
export interface StubAccountingInput {
  readonly statics: readonly StaticStubSlot[];
  readonly signatures: readonly ScannedStubHole[];
  readonly connections: readonly ConnectionStubHole[];
}

function claimedCodeCounts(input: StubAccountingInput): Map<string, number> {
  const counts = new Map<string, number>();
  for (const hole of [...input.signatures, ...input.connections]) {
    const code = hole.wormholeTypeCode;
    if (code !== null) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

function openStaticSlots(input: StubAccountingInput): readonly StaticStubSlot[] {
  const totalByCode = new Map<string, number>();
  for (const slot of input.statics) {
    totalByCode.set(slot.code, (totalByCode.get(slot.code) ?? 0) + 1);
  }
  const claimed = claimedCodeCounts(input);
  const keepByCode = new Map(
    [...totalByCode].map(([code, total]) => [
      code,
      Math.max(0, total - (claimed.get(code) ?? 0)),
    ]),
  );

  // Retain the earliest duplicate slots. When a code-carrying line appears,
  // the highest ordinal disappears; collapse therefore restores one stable
  // sibling instead of renumbering every duplicate.
  const keptByCode = new Map<string, number>();
  return input.statics.filter((slot) => {
    const kept = keptByCode.get(slot.code) ?? 0;
    if (kept >= (keepByCode.get(slot.code) ?? 0)) return false;
    keptByCode.set(slot.code, kept + 1);
    return true;
  });
}

/** Computes the exact statics and scanned ghosts the canvas should draw. */
export function believedHoles(input: StubAccountingInput): StubPlan {
  const staticStubs = openStaticSlots(input);
  const unidentified = input.signatures.filter(
    (signature) => signature.wormholeTypeCode === null,
  );
  const unlinkedLines = input.connections.filter(
    (connection) => !connection.linkedSignature,
  ).length;
  const unknownCount = Math.max(
    0,
    unidentified.length - staticStubs.length - unlinkedLines,
  );
  const firstUnknown = unidentified.length - unknownCount;
  let unidentifiedIndex = 0;
  const signatureStubIds = input.signatures.flatMap((signature) => {
    if (signature.wormholeTypeCode !== null) return [signature.id];
    const draw = unidentifiedIndex >= firstUnknown;
    unidentifiedIndex += 1;
    return draw ? [signature.id] : [];
  });

  return { staticStubs, signatureStubIds, unknownCount };
}
