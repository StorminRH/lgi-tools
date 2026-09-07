export interface ScannedStubHole {
  readonly id: string;
  readonly wormholeTypeCode: string | null;
}

export interface ConnectionStubHole {
  readonly wormholeTypeCode: string | null;
  readonly linkedSignature: boolean;
}

export function hiddenUnidentifiedSignatures(input: {
  readonly unclaimedStatics: number;
  readonly signatures: readonly ScannedStubHole[];
  readonly connections: readonly ConnectionStubHole[];
  readonly isRoot: boolean;
}): ReadonlySet<string> {
  const unidentified = input.signatures.filter(
    (signature) => signature.wormholeTypeCode === null,
  );
  const unlinkedLines = input.connections.filter(
    (connection) => !connection.linkedSignature,
  ).length;
  const returnSlots = input.isRoot ? unlinkedLines : Math.max(unlinkedLines, 1);
  const unknownCount = Math.max(
    0,
    unidentified.length - input.unclaimedStatics - returnSlots,
  );
  const firstUnknown = unidentified.length - unknownCount;
  const hidden = new Set<string>();
  let unidentifiedIndex = 0;
  for (const signature of input.signatures) {
    if (signature.wormholeTypeCode !== null) continue;
    if (unidentifiedIndex < firstUnknown) hidden.add(signature.id);
    unidentifiedIndex += 1;
  }
  return hidden;
}
