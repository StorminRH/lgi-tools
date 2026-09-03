export interface StaticStubSlot {
  readonly id: string;
  readonly code: string;
  readonly className: string;
  readonly whClassId: number;
}

export interface ScannedStubHole {
  readonly id: string;
  readonly wormholeTypeCode: string | null;
}

export interface ConnectionStubHole {
  readonly wormholeTypeCode: string | null;
  readonly linkedSignature: boolean;
}

export interface StubPlan {
  readonly staticStubs: readonly StaticStubSlot[];
  readonly signatureStubIds: readonly string[];
  readonly unknownCount: number;
}

export interface StubAccountingInput {
  readonly statics: readonly StaticStubSlot[];
  readonly signatures: readonly ScannedStubHole[];
  readonly connections: readonly ConnectionStubHole[];
  readonly isRoot: boolean;
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

  const keptByCode = new Map<string, number>();
  return input.statics.filter((slot) => {
    const kept = keptByCode.get(slot.code) ?? 0;
    if (kept >= (keepByCode.get(slot.code) ?? 0)) return false;
    keptByCode.set(slot.code, kept + 1);
    return true;
  });
}

export function believedHoles(input: StubAccountingInput): StubPlan {
  const staticStubs = openStaticSlots(input);
  const unidentified = input.signatures.filter(
    (signature) => signature.wormholeTypeCode === null,
  );
  const unlinkedLines = input.connections.filter(
    (connection) => !connection.linkedSignature,
  ).length;
  const returnSlots = input.isRoot ? unlinkedLines : Math.max(unlinkedLines, 1);
  const unknownCount = Math.max(
    0,
    unidentified.length - staticStubs.length - returnSlots,
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
